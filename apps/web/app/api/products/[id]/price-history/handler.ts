// apps/web/app/api/products/[id]/price-history/handler.ts
import type { Prisma } from "@partsradar/db";

import {
  InvalidQueryError,
  parseOptionalIntegerQuery,
} from "../../../_shared/query";
import {
  internalErrorResponse,
  invalidQueryResponse,
  jsonOk,
  notFoundResponse,
} from "../../../_shared/responses";
import { normalizeProductId } from "../product-id";

const ALLOWED_RANGE_DAYS = new Set([7, 30, 90]);
const ALLOWED_RANGE_VALUES = new Set(["7d", "30d", "90d", "all"]);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const PRICE_HISTORY_SNAPSHOT_SELECT = {
  price: true,
  currency: true,
  capturedAt: true,
} as const satisfies Prisma.PriceSnapshotSelect;

const PRICE_HISTORY_PRODUCT_SELECT = {
  id: true,
  currentPrice: {
    select: {
      lastSeenAt: true,
      priceSnapshot: {
        select: PRICE_HISTORY_SNAPSHOT_SELECT,
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

type PriceHistoryProductRecord = Prisma.ProductGetPayload<{
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
}>;
type PriceHistorySnapshotRecord = Prisma.PriceSnapshotGetPayload<{
  select: typeof PRICE_HISTORY_SNAPSHOT_SELECT;
}>;

type ProductFindFirstArgs = Omit<Prisma.ProductFindFirstArgs, "select"> & {
  select: typeof PRICE_HISTORY_PRODUCT_SELECT;
};
type PriceSnapshotFindManyArgs = Omit<Prisma.PriceSnapshotFindManyArgs, "select"> & {
  select: typeof PRICE_HISTORY_SNAPSHOT_SELECT;
};

export interface ProductPriceHistoryReadClient {
  product: {
    findFirst(args: ProductFindFirstArgs): Promise<PriceHistoryProductRecord | null>;
  };
  priceSnapshot: {
    findMany(args: PriceSnapshotFindManyArgs): Promise<PriceHistorySnapshotRecord[]>;
  };
}

interface PriceHistoryPointResponse {
  amount: number;
  currency: "TWD";
  observedAt: string;
  source: "price_snapshot" | "current_price_confirmation";
}

interface PriceHistorySummaryPoint {
  amount: number;
  observedAt: string;
}

interface ProductPriceHistoryResponseBody {
  productId: string;
  range: "7d" | "30d" | "90d" | "all";
  rangeDays: 7 | 30 | 90 | null;
  points: PriceHistoryPointResponse[];
  summary: {
    pointCount: number;
    startedAt: string | null;
    endedAt: string | null;
    lowest: PriceHistorySummaryPoint | null;
    highest: PriceHistorySummaryPoint | null;
    first: PriceHistorySummaryPoint | null;
    latest: PriceHistorySummaryPoint | null;
    deltaAmount: number | null;
    deltaPercent: number | null;
  };
}

interface ProductPriceHistoryHandlerOptions {
  now?: Date;
}

export function createGetProductPriceHistoryHandler(
  client: ProductPriceHistoryReadClient,
  options: ProductPriceHistoryHandlerOptions = {},
): (productId: string, requestUrl: string) => Promise<Response> {
  return async (productId, requestUrl) => {
    try {
      const normalizedProductId = normalizeProductId(productId);

      if (!normalizedProductId) {
        return notFoundResponse();
      }

      const range = parseRange(new URL(requestUrl).searchParams);
      const now = options.now ?? new Date();
      const since =
        range.days === null ? null : new Date(now.getTime() - range.days * MILLISECONDS_PER_DAY);
      const product = await client.product.findFirst({
        where: {
          id: normalizedProductId,
          sourceCategory: {
            enabled: true,
          },
          primaryImageUrl: {
            not: null,
          },
          primaryImageCheckedAt: {
            not: null,
          },
          currentPrice: {
            isNot: null,
          },
        },
        select: PRICE_HISTORY_PRODUCT_SELECT,
      });

      if (!product) {
        return notFoundResponse();
      }

      const snapshots = await client.priceSnapshot.findMany({
        where: {
          productId: normalizedProductId,
          ...(since
            ? {
                capturedAt: {
                  gte: since,
                },
              }
            : {}),
        },
        orderBy: {
          capturedAt: "asc",
        },
        select: PRICE_HISTORY_SNAPSHOT_SELECT,
      });

      return jsonOk<ProductPriceHistoryResponseBody>(
        toPriceHistoryResponse(normalizedProductId, range, snapshots, product, since),
      );
    } catch (error) {
      if (error instanceof InvalidQueryError) {
        return invalidQueryResponse();
      }

      return internalErrorResponse();
    }
  };
}

function parseRange(params: URLSearchParams): {
  key: "7d" | "30d" | "90d" | "all";
  days: 7 | 30 | 90 | null;
} {
  const range = params.get("range");

  if (range) {
    if (!ALLOWED_RANGE_VALUES.has(range)) {
      throw new InvalidQueryError("range", "must be one of 7d, 30d, 90d, or all");
    }

    return range === "all"
      ? { key: "all", days: null }
      : {
          key: range as "7d" | "30d" | "90d",
          days: Number.parseInt(range, 10) as 7 | 30 | 90,
        };
  }

  const days =
    parseOptionalIntegerQuery(params, "days", {
      defaultValue: 90,
      min: 1,
      max: 90,
    }) ?? 90;

  if (!ALLOWED_RANGE_DAYS.has(days)) {
    throw new InvalidQueryError("days", "must be one of 7, 30, or 90");
  }

  return {
    key: `${days}d` as "7d" | "30d" | "90d",
    days: days as 7 | 30 | 90,
  };
}

function toPriceHistoryResponse(
  productId: string,
  range: {
    key: "7d" | "30d" | "90d" | "all";
    days: 7 | 30 | 90 | null;
  },
  snapshots: PriceHistorySnapshotRecord[],
  product: PriceHistoryProductRecord,
  since: Date | null,
): ProductPriceHistoryResponseBody {
  const points = toPriceHistoryPoints(snapshots, product.currentPrice, since);

  const first = points[0] ? toSummaryPoint(points[0]) : null;
  const latest = points.at(-1) ? toSummaryPoint(points.at(-1) as PriceHistoryPointResponse) : null;
  const lowest = points.length > 0 ? toSummaryPoint(minByAmount(points)) : null;
  const highest = points.length > 0 ? toSummaryPoint(maxByAmount(points)) : null;
  const deltaAmount = first && latest && points.length >= 2 ? latest.amount - first.amount : null;

  return {
    productId,
    range: range.key,
    rangeDays: range.days,
    points,
    summary: {
      pointCount: points.length,
      startedAt: first?.observedAt ?? null,
      endedAt: latest?.observedAt ?? null,
      lowest,
      highest,
      first,
      latest,
      deltaAmount,
      deltaPercent:
        deltaAmount !== null && first && first.amount !== 0
          ? Number(((deltaAmount / first.amount) * 100).toFixed(2))
          : null,
    },
  };
}

function toPriceHistoryPoints(
  snapshots: PriceHistorySnapshotRecord[],
  currentPrice: PriceHistoryProductRecord["currentPrice"],
  since: Date | null,
): PriceHistoryPointResponse[] {
  const points: PriceHistoryPointResponse[] = snapshots.map((snapshot) => ({
    amount: snapshot.price,
    currency: snapshot.currency,
    observedAt: snapshot.capturedAt.toISOString(),
    source: "price_snapshot" as const,
  }));

  if (!currentPrice || (since && currentPrice.lastSeenAt.getTime() < since.getTime())) {
    return points;
  }

  const latestPoint = points.at(-1);

  if (
    latestPoint &&
    currentPrice.lastSeenAt.getTime() <= new Date(latestPoint.observedAt).getTime()
  ) {
    return points;
  }

  points.push({
    amount: currentPrice.priceSnapshot.price,
    currency: currentPrice.priceSnapshot.currency,
    observedAt: currentPrice.lastSeenAt.toISOString(),
    source: "current_price_confirmation",
  });

  return points;
}

function toSummaryPoint(point: PriceHistoryPointResponse): PriceHistorySummaryPoint {
  return {
    amount: point.amount,
    observedAt: point.observedAt,
  };
}

function minByAmount(points: PriceHistoryPointResponse[]): PriceHistoryPointResponse {
  return points.reduce((lowest, point) => (point.amount < lowest.amount ? point : lowest));
}

function maxByAmount(points: PriceHistoryPointResponse[]): PriceHistoryPointResponse {
  return points.reduce((highest, point) => (point.amount > highest.amount ? point : highest));
}
