// packages/db/prisma/seed.ts
// 寫入 PartsRadarTW 第一版使用的 CoolPC sourceCategory 基礎分類資料。

import { prisma } from "../src/client";

const coolpcCategories = [
  {
    igrp: 4,
    sourceName: "處理器 CPU",
    displayName: "CPU",
  },
  {
    igrp: 5,
    sourceName: "主機板 MB",
    displayName: "主機板",
  },
  {
    igrp: 6,
    sourceName: "記憶體 RAM",
    displayName: "記憶體",
  },
  {
    igrp: 7,
    sourceName: "內接硬碟 HDD / 固態 SSD",
    displayName: "SSD / HDD",
  },
  {
    igrp: 8,
    sourceName: "外接硬碟 / 隨身碟 / 記憶卡",
    displayName: "外接儲存",
  },
  {
    igrp: 10,
    sourceName: "散熱器 / 散熱墊 / 散熱膏",
    displayName: "散熱器",
  },
  {
    igrp: 11,
    sourceName: "封閉式 / 開放式水冷",
    displayName: "水冷",
  },
  {
    igrp: 12,
    sourceName: "顯示卡 VGA",
    displayName: "顯示卡",
  },
  {
    igrp: 14,
    sourceName: "CASE 機殼",
    displayName: "機殼",
  },
  {
    igrp: 15,
    sourceName: "電源供應器",
    displayName: "電源供應器",
  },
  {
    igrp: 16,
    sourceName: "機殼風扇 / 機殼配件",
    displayName: "風扇 / 配件",
  },
] as const;

// 以 IGrp 作為穩定 key upsert 分類，確保部署或本機重跑 seed 時分類名稱同步更新。
async function main() {
  for (const category of coolpcCategories) {
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
