// apps/web/app/ops/status/client.ts
// 封裝 /ops/status 資料收集使用的 Prisma read client，方便測試注入 fake client。

import type { Prisma, PrismaClient } from "@partsradar/db";
import {
  type OPS_DISPLAY_READY_PRODUCT_ID_QUERY,
  OPS_LATEST_SCHEDULED_RUN_QUERY,
  OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY,
  type OPS_RECENT_CRAWL_RUN_QUERY,
  type OPS_SOURCE_CATEGORY_QUERY,
  type OpsDisplayReadyProductRecord,
  type OpsLatestScheduledRunRecord,
  type OpsLatestSuccessfulScheduledRunRecord,
  type OpsRecentCrawlRunRecord,
  type OpsSourceCategoryRecord,
} from "./queries";

// /ops/status 所需的窄版讀取介面，只暴露狀態頁會查詢的 aggregate 與清單操作。
export interface OpsStatusReadClient {
  sourceCategory: {
    findMany(args: typeof OPS_SOURCE_CATEGORY_QUERY): Promise<OpsSourceCategoryRecord[]>;
  };
  crawlRun: {
    findLatestScheduled(): Promise<OpsLatestScheduledRunRecord | null>;
    findLatestSuccessfulScheduled(): Promise<OpsLatestSuccessfulScheduledRunRecord | null>;
    findMany(args: typeof OPS_RECENT_CRAWL_RUN_QUERY): Promise<OpsRecentCrawlRunRecord[]>;
    count(args: Prisma.CrawlRunCountArgs): Promise<number>;
  };
  parseError: {
    count(args: Prisma.ParseErrorCountArgs): Promise<number>;
  };
  product: {
    count(args: Prisma.ProductCountArgs): Promise<number>;
    findMany(
      args: typeof OPS_DISPLAY_READY_PRODUCT_ID_QUERY,
    ): Promise<OpsDisplayReadyProductRecord[]>;
  };
  productLinkHealth: {
    count(args: Prisma.ProductLinkHealthCountArgs): Promise<number>;
  };
  rawSnapshot: {
    count(args: Prisma.RawSnapshotCountArgs): Promise<number>;
  };
  discordPriceReportSetting: {
    count(args: Prisma.DiscordPriceReportSettingCountArgs): Promise<number>;
  };
  discordTargetPriceWatch: {
    count(args: Prisma.DiscordTargetPriceWatchCountArgs): Promise<number>;
  };
  discordNotificationDelivery: {
    count(args: Prisma.DiscordNotificationDeliveryCountArgs): Promise<number>;
    findMany(args: Prisma.DiscordNotificationDeliveryFindManyArgs): Promise<unknown[]>;
  };
}

// 將 PrismaClient 轉成 ops status read client，讓資料收集層不直接依賴全量 Prisma API。
export function createPrismaOpsStatusClient(prisma: PrismaClient): OpsStatusReadClient {
  return {
    sourceCategory: {
      findMany: (args) => prisma.sourceCategory.findMany(args),
    },
    crawlRun: {
      findLatestScheduled: () => prisma.crawlRun.findFirst(OPS_LATEST_SCHEDULED_RUN_QUERY),
      findLatestSuccessfulScheduled: () =>
        prisma.crawlRun.findFirst(OPS_LATEST_SUCCESSFUL_SCHEDULED_RUN_QUERY),
      findMany: (args) => prisma.crawlRun.findMany(args),
      count: (args) => prisma.crawlRun.count(args),
    },
    parseError: {
      count: (args) => prisma.parseError.count(args),
    },
    product: {
      count: (args) => prisma.product.count(args),
      findMany: (args) => prisma.product.findMany(args),
    },
    productLinkHealth: {
      count: (args) => prisma.productLinkHealth.count(args),
    },
    rawSnapshot: {
      count: (args) => prisma.rawSnapshot.count(args),
    },
    discordPriceReportSetting: {
      count: (args) => prisma.discordPriceReportSetting.count(args),
    },
    discordTargetPriceWatch: {
      count: (args) => prisma.discordTargetPriceWatch.count(args),
    },
    discordNotificationDelivery: {
      count: (args) => prisma.discordNotificationDelivery.count(args),
      findMany: (args) => prisma.discordNotificationDelivery.findMany(args),
    },
  };
}
