// apps/web/app/ops/status/data/link-health.ts
// 收集 /ops/status 顯示用的 active 商品來源連結健康統計。

import type { OpsStatusReadClient } from "../client";

const LINK_KINDS = ["SOURCE"] as const;
const LINK_STATUSES = ["OK", "BROKEN", "TEMPORARY_ERROR"] as const;

type ProductLinkKindValue = (typeof LINK_KINDS)[number];
type ProductLinkHealthStatusValue = (typeof LINK_STATUSES)[number];

// 單一商品連結類型的健康狀態統計。
export interface OpsStatusLinkKindSummary {
  ok: number;
  broken: number;
  temporaryError: number;
}

// /ops/status 目前只顯示來源連結健康狀態。
export interface OpsStatusLinkHealthSummary {
  source: OpsStatusLinkKindSummary;
}

// 統計 active 商品的來源連結 OK / broken / temporary error 數量。
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
