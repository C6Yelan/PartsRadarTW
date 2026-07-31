// packages/db/src/product-facets/availability.ts
// 以有限 facet registry candidates 查詢目前有有效商品支援的公開 filter tags。

import { getPublicProductFacetAvailabilityTags } from "@partsradar/shared";
import { Prisma } from "@prisma/client";

export const PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS = 1_000;

interface ProductFacetAvailabilityTransactionClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

export interface ProductFacetAvailabilityClient {
  $transaction<T>(
    callback: (transaction: ProductFacetAvailabilityTransactionClient) => Promise<T>,
  ): Promise<T>;
}

interface AvailableProductFacetTagRow {
  tag: string;
}

export class ProductFacetAvailabilityContractError extends Error {
  override readonly name = "ProductFacetAvailabilityContractError";
}

export async function readAvailableProductFacetTags(
  client: ProductFacetAvailabilityClient,
  igrp: number,
): Promise<string[]> {
  const candidateTags = getPublicProductFacetAvailabilityTags(igrp);

  if (candidateTags.length === 0) {
    return [];
  }

  const rows = await client.$transaction(async (transaction) => {
    const timeoutRows = await transaction.$queryRaw<Array<{ applied: boolean }>>(
      Prisma.sql`
        WITH configured AS MATERIALIZED (
          SELECT
            set_config(
              'statement_timeout',
              ${`${PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS}ms`},
              TRUE
            ) AS timeout_value,
            set_config('enable_seqscan', 'off', TRUE) AS seqscan_value,
            set_config('enable_bitmapscan', 'off', TRUE) AS bitmapscan_value,
            set_config('enable_indexscan', 'on', TRUE) AS indexscan_value,
            set_config('enable_indexonlyscan', 'on', TRUE) AS indexonlyscan_value
        )
        SELECT
          timeout_value = current_setting('statement_timeout')
          AND current_setting('statement_timeout')::interval =
            ${`${PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS} milliseconds`}::interval
          AND seqscan_value = current_setting('enable_seqscan')
          AND current_setting('enable_seqscan') = 'off'
          AND bitmapscan_value = current_setting('enable_bitmapscan')
          AND current_setting('enable_bitmapscan') = 'off'
          AND indexscan_value = current_setting('enable_indexscan')
          AND current_setting('enable_indexscan') = 'on'
          AND indexonlyscan_value = current_setting('enable_indexonlyscan')
          AND current_setting('enable_indexonlyscan') = 'on'
          AS applied
        FROM configured
      `,
    );

    if (timeoutRows.length !== 1 || timeoutRows[0]?.applied !== true) {
      throw new ProductFacetAvailabilityContractError(
        "Product facet availability query work contract was not applied.",
      );
    }

    const indexRows = await transaction.$queryRaw<Array<{ ready: boolean }>>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_index AS index_metadata
          INNER JOIN pg_class AS index_relation
            ON index_relation.oid = index_metadata.indexrelid
          INNER JOIN pg_class AS table_relation
            ON table_relation.oid = index_metadata.indrelid
          INNER JOIN pg_namespace AS relation_namespace
            ON relation_namespace.oid = index_relation.relnamespace
          INNER JOIN pg_am AS index_method
            ON index_method.oid = index_relation.relam
          WHERE relation_namespace.nspname = current_schema()
            AND table_relation.relname = 'product_facet_eligible_products'
            AND index_relation.relname = 'product_facet_eligible_products_pkey'
            AND index_method.amname = 'btree'
            AND index_metadata.indisvalid = TRUE
            AND index_metadata.indisready = TRUE
            AND pg_get_indexdef(index_metadata.indexrelid)
              LIKE '%USING btree (igrp, tag, product_id)'
        ) AS ready
      `,
    );

    if (indexRows.length !== 1 || indexRows[0]?.ready !== true) {
      throw new ProductFacetAvailabilityContractError(
        "Product facet availability index contract is not ready.",
      );
    }

    return transaction.$queryRaw<AvailableProductFacetTagRow[]>(
      createAvailableProductFacetTagsQuery(igrp, candidateTags),
    );
  });
  const availableTags = validateAvailableProductFacetTagRows(rows, candidateTags);

  return candidateTags.filter((tag) => availableTags.has(tag));
}

export function createAvailableProductFacetTagsQuery(
  igrp: number,
  candidateTags: readonly string[],
): Prisma.Sql {
  if (candidateTags.length === 0) {
    throw new Error("At least one product facet candidate tag is required.");
  }

  return Prisma.sql`
    WITH candidate_tags (tag, sort_order) AS (
      VALUES ${Prisma.join(
        candidateTags.map((tag, index) => Prisma.sql`(${tag}::text, ${index}::integer)`),
      )}
    )
    SELECT candidate.tag
    FROM candidate_tags AS candidate
    CROSS JOIN LATERAL (
      SELECT TRUE
      FROM product_facet_eligible_products AS projection
      WHERE projection.igrp = ${igrp}
        AND projection.tag = candidate.tag
      LIMIT 1
    ) AS availability
    ORDER BY candidate.sort_order ASC
  `;
}

function validateAvailableProductFacetTagRows(
  rows: readonly AvailableProductFacetTagRow[],
  candidateTags: readonly string[],
): ReadonlySet<string> {
  const candidateTagSet = new Set(candidateTags);

  if (candidateTagSet.size !== candidateTags.length || rows.length > candidateTags.length) {
    throw new ProductFacetAvailabilityContractError(
      "Product facet availability query exceeded its registry result contract.",
    );
  }

  const availableTags = new Set<string>();

  for (const row of rows) {
    if (
      typeof row.tag !== "string" ||
      !candidateTagSet.has(row.tag) ||
      availableTags.has(row.tag)
    ) {
      throw new ProductFacetAvailabilityContractError(
        "Product facet availability query returned an invalid registry result.",
      );
    }
    availableTags.add(row.tag);
  }

  return availableTags;
}
