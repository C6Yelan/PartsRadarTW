// packages/db/prisma/seed.ts
// 寫入 PartsRadarTW 支援的 CoolPC sourceCategory 基礎分類資料。

import { COOLPC_CATEGORY_IDENTITIES } from "@partsradar/shared";
import { prisma } from "../src/client";

// 以 IGrp 作為穩定 key upsert 分類，確保部署或本機重跑 seed 時分類名稱同步更新。
async function main() {
  for (const category of COOLPC_CATEGORY_IDENTITIES) {
    await prisma.sourceCategory.upsert({
      where: {
        igrp: category.igrp,
      },
      update: {
        sourceName: category.sourceName,
        displayName: category.displayName,
        enabled: true,
      },
      create: {
        igrp: category.igrp,
        sourceName: category.sourceName,
        displayName: category.displayName,
        enabled: true,
      },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(() => {
    console.error("Database seed failed. Check the database connection and Prisma schema state.");
    process.exitCode = 1;
  });
