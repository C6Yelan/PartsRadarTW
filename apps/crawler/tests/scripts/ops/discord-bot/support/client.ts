// apps/crawler/tests/scripts/ops/discord-bot/support/client.ts
// 組合 Discord bot 測試用 fake Prisma client，讓互動、報告與 watch 測試共用資料入口。
import type { DiscordBotClient } from "../../../../../src/scripts/ops/discord-bot/types";
import type {
  TestCrawlRun,
  TestDiscordNotificationDelivery,
  TestDiscordPublicPriceReportDelivery,
  TestDiscordPublicPriceReportSetting,
  TestPriceReportSetting,
  TestSnapshot,
  TestSourceCategory,
  TestTargetPriceWatch,
} from "./data-types";
import { createNotificationDeliveryClient } from "./delivery-client";
import { TEST_SOURCE_CATEGORIES } from "./options";
import { createPriceReportReaderClient } from "./price-report-reader-client";
import { createPriceReportSettingClient } from "./price-report-setting-client";
import { createPublicReportClient } from "./public-report-client";
import { createTargetPriceWatchClient } from "./target-watch-client";

interface CreateDiscordBotClientOptions {
  snapshots?: TestSnapshot[];
  settings?: TestPriceReportSetting[];
  watches?: TestTargetPriceWatch[];
  categories?: TestSourceCategory[];
  deliveries?: TestDiscordNotificationDelivery[];
  publicPriceReportDeliveries?: TestDiscordPublicPriceReportDelivery[];
  crawlRuns?: TestCrawlRun[];
  publicPriceReportSettings?: TestDiscordPublicPriceReportSetting[];
}

// 依測試資料組出 DiscordBotClient 的局部 fake implementation，並保留 vi.fn 讓測試可檢查 DB 呼叫。
export function createDiscordBotClient({
  snapshots = [],
  settings = [],
  watches = [],
  categories = [...TEST_SOURCE_CATEGORIES],
  deliveries = [],
  publicPriceReportDeliveries = [],
  crawlRuns = [],
  publicPriceReportSettings = [],
}: CreateDiscordBotClientOptions = {}) {
  const priceReportReaderClient = createPriceReportReaderClient({
    snapshots,
    categories,
  });
  const publicReportClient = createPublicReportClient({
    crawlRuns,
    publicPriceReportDeliveries,
    publicPriceReportSettings,
  });

  const targetPriceWatchClient = createTargetPriceWatchClient(watches, snapshots);

  return asDiscordBotClient({
    crawlRun: publicReportClient.crawlRun,
    sourceCategory: priceReportReaderClient.sourceCategory,
    product: priceReportReaderClient.product,
    priceSnapshot: priceReportReaderClient.priceSnapshot,
    discordNotificationDelivery: createNotificationDeliveryClient(deliveries),
    discordPublicPriceReportDelivery: publicReportClient.discordPublicPriceReportDelivery,
    discordPublicPriceReportSetting: publicReportClient.discordPublicPriceReportSetting,
    discordPriceReportSetting: createPriceReportSettingClient(settings),
    discordTargetPriceWatch: targetPriceWatchClient.delegate,
    $transaction: targetPriceWatchClient.transaction,
  });
}

function asDiscordBotClient<T>(client: T): T & DiscordBotClient {
  return client as unknown as T & DiscordBotClient;
}
