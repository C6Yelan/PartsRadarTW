// apps/web/app/ops/status/data/link-health.ts

import type { OpsStatusReadClient } from "../client";

const LINK_KINDS = ["SOURCE"] as const;
const LINK_STATUSES = ["OK", "BROKEN", "TEMPORARY_ERROR"] as const;

type ProductLinkKindValue = (typeof LINK_KINDS)[number];
type ProductLinkHealthStatusValue = (typeof LINK_STATUSES)[number];

export interface OpsStatusLinkKindSummary {
  ok: number;
  broken: number;
  temporaryError: number;
}

export interface OpsStatusLinkHealthSummary {
  source: OpsStatusLinkKindSummary;
}

export async function collectLinkHealth(
  client: OpsStatusReadClient,
): Promise<OpsStatusLinkHealthSummary> {
  const [sourceOk, sourceBroken, sourceTemporaryError] = await Promise.all([
    countActiveProductLinks(client, "SOURCE", "OK"),
    countActiveProductLinks(client, "SOURCE", "BROKEN"),
    countActiveProductLinks(client, "SOURCE", "TEMPORARY_ERROR"),
  ]);

  return {
    source: {
      ok: sourceOk,
      broken: sourceBroken,
      temporaryError: sourceTemporaryError,
    },
  };
}

async function countActiveProductLinks(
  client: OpsStatusReadClient,
  linkKind: ProductLinkKindValue,
  status: ProductLinkHealthStatusValue,
): Promise<number> {
  return client.productLinkHealth.count({
    where: {
      linkKind,
      status,
      product: {
        isActive: true,
      },
    },
  });
}
