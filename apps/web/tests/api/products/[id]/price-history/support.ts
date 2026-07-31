// apps/web/tests/api/products/[id]/price-history/support.ts
// 提供商品價格歷史 API 測試共用的 fake read client、固定時間與價格資料 builder。

import type { ProductPriceHistoryReadClient } from "../../../../../app/api/products/[id]/price-history/data";
import {
  PRICE_HISTORY_BUCKET_COUNT,
  PRICE_HISTORY_RAW_PROBE_LIMIT,
} from "../../../../../app/api/products/[id]/price-history/limits";

export const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
export const NOW = new Date("2026-06-01T12:00:00.000Z");

type ProductFindFirstArgs = Parameters<ProductPriceHistoryReadClient["product"]["findFirst"]>[0];
type ProductRecord = Awaited<ReturnType<ProductPriceHistoryReadClient["product"]["findFirst"]>>;
type SnapshotRecord = {
  id: string;
  price: number;
  capturedAt: Date;
};

const VALID_INDEX_STATE = {
  tableSchema: "public",
  tableName: "price_snapshots",
  accessMethod: "btree",
  isValid: true,
  isReady: true,
  isLive: true,
  keyAttributeCount: 3,
  totalAttributeCount: 3,
  hasNoPredicate: true,
  keyNames: ["product_id", "captured_at", "id"],
  keyOptions: [0, 3, 3],
};

let snapshotSequence = 0;

export function fakePriceHistoryClient({
  productResult,
  snapshots,
  indexState = VALID_INDEX_STATE,
  transactionError,
}: {
  productResult: ProductRecord;
  snapshots: SnapshotRecord[];
  indexState?: Partial<typeof VALID_INDEX_STATE>;
  transactionError?: Error;
}) {
  const state = {
    lastProductFindFirstArgs: undefined as ProductFindFirstArgs | undefined,
    productFindFirstCallCount: 0,
    transactionCallCount: 0,
    queryRawTexts: [] as string[],
    queryRawValues: [] as unknown[][],
  };

  return {
    get lastProductFindFirstArgs() {
      return state.lastProductFindFirstArgs;
    },
    get productFindFirstCallCount() {
      return state.productFindFirstCallCount;
    },
    get transactionCallCount() {
      return state.transactionCallCount;
    },
    get queryRawTexts() {
      return state.queryRawTexts;
    },
    get queryRawValues() {
      return state.queryRawValues;
    },
    product: {
      async findFirst(args) {
        state.productFindFirstCallCount += 1;
        state.lastProductFindFirstArgs = args;

        return productResult;
      },
    },
    async $transaction(callback) {
      state.transactionCallCount += 1;

      if (transactionError) {
        throw transactionError;
      }

      return callback({
        async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
          const sql = toSqlText(strings);
          state.queryRawTexts.push(sql);
          state.queryRawValues.push(values);
          expectNoEmbeddedValues(strings, values);

          if (sql.includes("set_config(")) {
            return [
              {
                seqScan: "off",
                bitmapScan: "off",
                indexScan: "on",
                indexOnlyScan: "on",
                statementTimeout: "2500ms",
              },
            ] as T;
          }

          if (sql.includes('FROM pg_catalog."pg_class"')) {
            return [{ ...VALID_INDEX_STATE, ...indexState }] as T;
          }

          const since = values.find((value): value is Date => value instanceof Date) ?? null;
          const eligibleSnapshots = snapshots
            .filter((item) => !since || item.capturedAt.getTime() >= since.getTime())
            .toSorted(compareSnapshots);

          if (sql.includes('WITH "bounds"')) {
            return sampleSnapshots(eligibleSnapshots) as T;
          }

          if (sql.includes('ORDER BY snapshot."captured_at" DESC')) {
            return (eligibleSnapshots.at(-1) ? [eligibleSnapshots.at(-1)] : []) as T;
          }

          return eligibleSnapshots.slice(0, PRICE_HISTORY_RAW_PROBE_LIMIT) as T;
        },
      });
    },
  } satisfies ProductPriceHistoryReadClient & {
    lastProductFindFirstArgs?: ProductFindFirstArgs;
    productFindFirstCallCount: number;
    transactionCallCount: number;
    queryRawTexts: string[];
    queryRawValues: unknown[][];
  };
}

export function snapshot(price: number, capturedAt: string, id?: string): SnapshotRecord {
  snapshotSequence += 1;

  return {
    id: id ?? `snapshot-${snapshotSequence.toString().padStart(6, "0")}`,
    price,
    capturedAt: new Date(capturedAt),
  };
}

export function productRecord({
  price = 5900,
  lastSeenAt = "2026-05-20T08:00:00.000Z",
}: {
  price?: number;
  lastSeenAt?: string;
} = {}): NonNullable<ProductRecord> {
  return {
    currentPrice: {
      lastSeenAt: new Date(lastSeenAt),
      priceSnapshot: {
        price,
      },
    },
  };
}

function toSqlText(strings: TemplateStringsArray): string {
  return strings.join("?").replaceAll(/\s+/g, " ").trim();
}

function expectNoEmbeddedValues(strings: TemplateStringsArray, values: unknown[]): void {
  if (strings.length !== values.length + 1) {
    throw new Error("Fake raw query received a non-parameterized SQL call.");
  }
}

function compareSnapshots(left: SnapshotRecord, right: SnapshotRecord): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function sampleSnapshots(snapshots: SnapshotRecord[]): SnapshotRecord[] {
  const first = snapshots[0];
  const latest = snapshots.at(-1);

  if (!first || !latest) {
    return [];
  }

  const representatives = new Map<string, SnapshotRecord>([
    [first.id, first],
    [latest.id, latest],
  ]);
  const firstTime = first.capturedAt.getTime();
  const latestTime = latest.capturedAt.getTime();
  const span = latestTime - firstTime;

  for (let bucket = 0; bucket < PRICE_HISTORY_BUCKET_COUNT; bucket += 1) {
    const start = firstTime + (span * bucket) / PRICE_HISTORY_BUCKET_COUNT;
    const end =
      bucket === PRICE_HISTORY_BUCKET_COUNT - 1
        ? latestTime
        : firstTime + (span * (bucket + 1)) / PRICE_HISTORY_BUCKET_COUNT;
    const inBucket = snapshots.filter((item) => {
      const observedAt = item.capturedAt.getTime();
      return observedAt >= start && observedAt < end;
    });
    const bucketFirst = inBucket[0];
    const bucketLast = inBucket.at(-1);

    if (bucketFirst) {
      representatives.set(bucketFirst.id, bucketFirst);
    }

    if (bucketLast) {
      representatives.set(bucketLast.id, bucketLast);
    }
  }

  return [...representatives.values()].sort(compareSnapshots);
}
