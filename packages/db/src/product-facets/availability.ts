// packages/db/src/product-facets/availability.ts
// 以有限 facet registry candidates 查詢目前有有效商品支援的公開 filter tags。

import { getPublicProductFacetAvailabilityTags } from "@partsradar/shared";
import { Prisma } from "@prisma/client";

export interface ProductFacetAvailabilityClient {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}

interface AvailableProductFacetTagRow {
  tag: string;
}

export async function readAvailableProductFacetTags(
  client: ProductFacetAvailabilityClient,
  igrp: number,
): Promise<string[]> {
  const candidateTags = getPublicProductFacetAvailabilityTags(igrp);

  if (candidateTags.length === 0) {
    return [];
  }

  const rows = await client.$queryRaw<AvailableProductFacetTagRow[]>(
    createAvailableProductFacetTagsQuery(igrp, candidateTags),
  );
  const availableTags = new Set(rows.map(({ tag }) => tag));

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
    ),
    available_tags (tag) AS (
      SELECT DISTINCT product_tag.tag
      FROM products AS product
      INNER JOIN source_categories AS category
        ON category.id = product.source_category_id
      INNER JOIN current_prices AS current_price
        ON current_price.product_id = product.id
      CROSS JOIN LATERAL unnest(product.filter_tags) AS product_tag(tag)
      WHERE category.igrp = ${igrp}
        AND category.enabled = TRUE
        AND product.is_active = TRUE
        AND product.is_excluded = FALSE
        AND product.filter_tags && ARRAY[${Prisma.join(candidateTags)}]::text[]
        AND product_tag.tag = ANY(ARRAY[${Prisma.join(candidateTags)}]::text[])
    )
    SELECT candidate.tag
    FROM candidate_tags AS candidate
    INNER JOIN available_tags AS available
      ON available.tag = candidate.tag
    ORDER BY candidate.sort_order ASC
  `;
}
