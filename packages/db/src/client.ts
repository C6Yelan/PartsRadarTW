// packages/db/src/client.ts
// 提供 monorepo 共用的 Prisma client 建立、dev/test 連線池重用與 Prisma 型別出口。

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a Prisma client.");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  // dev/test reload 期間重用 client，避免 Next.js 或 tsx 每次重新載入模組都建立新連線池。
  globalForPrisma.prisma = prisma;
}

export type {
  CrawlRunStatus,
  DiscordDeliveryErrorCategory,
  DiscordPriceReportSetting,
  DiscordPublicReportAccessStatus,
  ParseErrorType,
  Prisma,
} from "@prisma/client";
export { PrismaClient };
