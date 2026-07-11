// apps/web/app/announcements/data.ts
// 維護公開公告與首頁 pinned 公告的有效期限判斷，不依賴資料庫或 CMS。

export interface PublicAnnouncement {
  id: string;
  title: string;
  summary: string;
  body: readonly string[];
  severity: "info" | "maintenance" | "warning";
  publishedAt: string;
  expiresAt?: string;
  pinned?: boolean;
}

export const PUBLIC_ANNOUNCEMENTS: readonly PublicAnnouncement[] = [
  {
    id: "public-preview-2026-07",
    title: "網站公開測試中",
    summary: "商品與價格資訊可能因來源更新時間而有延遲，實際價格、庫存與規格請以原價屋頁面為準。",
    body: [
      "PartsRadarTW 目前以公開測試形式提供商品查詢、類別進階篩選、價格變動總覽與瀏覽器本機配單。",
      "本站是非官方、非商業的資料整理工具，不販售商品，也不代表原價屋或任何品牌。",
    ],
    severity: "info",
    publishedAt: "2026-07-12",
    pinned: true,
  },
  {
    id: "price-report-and-facets-2026-07",
    title: "新增價格變動總覽與類別進階篩選",
    summary: "可依時間、漲跌類型、分類與關鍵字查看價格動態，商品頁也新增類別專屬條件。",
    body: [
      "價格變動總覽只提供查閱，不會替網站使用者建立通知或修改 Discord 設定。",
      "進階條件由既有原價屋商品名稱整理，不會額外爬取其他商店或外部規格網站。",
    ],
    severity: "info",
    publishedAt: "2026-07-12",
  },
];

export function findActivePinnedAnnouncement(
  announcements: readonly PublicAnnouncement[],
  now: Date,
): PublicAnnouncement | null {
  const nowTime = now.getTime();

  return (
    listPublishedAnnouncements(announcements, now).find((announcement) => {
      const expiresTime = announcement.expiresAt
        ? parseAnnouncementTime(announcement.expiresAt)
        : null;

      return (
        announcement.pinned === true &&
        (expiresTime === null || (Number.isFinite(expiresTime) && expiresTime > nowTime))
      );
    }) ?? null
  );
}

export function listPublishedAnnouncements(
  announcements: readonly PublicAnnouncement[],
  now: Date,
): PublicAnnouncement[] {
  const nowTime = now.getTime();

  return announcements
    .filter((announcement) => {
      const publishedTime = parseAnnouncementTime(announcement.publishedAt);
      return Number.isFinite(publishedTime) && publishedTime <= nowTime;
    })
    .sort(
      (left, right) =>
        parseAnnouncementTime(right.publishedAt) - parseAnnouncementTime(left.publishedAt),
    );
}

function parseAnnouncementTime(value: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T00:00:00+08:00`)
    : Date.parse(value);
}
