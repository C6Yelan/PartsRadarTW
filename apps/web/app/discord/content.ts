// apps/web/app/discord/content.ts
// 集中 Discord 介紹頁使用的靜態文案與截圖 metadata，避免頁面 JSX 混入大量內容資料。

export const heroScreenshot = {
  alt: "Discord 指令選單截圖",
  height: 377,
  src: "/images/discord/commands-screenshot.png",
  width: 1218,
} as const;

export const screenshotFreshnessNotice =
  "文字說明反映目前功能；操作截圖為較早版本介面示意，部分欄位與指令文字可能不同。";

// Discord bot 初次使用流程，供頁面快速開始區塊呈現。
export const quickStartSteps = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description:
      "成員可使用 /watch、/price-report；/public-report 只限具備「管理伺服器」權限的成員在伺服器使用。",
  },
  {
    title: "目標價提醒",
    command: "/watch",
    description: "管理追蹤商品；價格達標時會嘗試透過 DM 傳送目標價提醒。",
  },
  {
    title: "即時價格報告",
    command: "/price-report now",
    description: "在目前伺服器頻道或 DM 取得 6、12 或 24 小時的價格變動。",
  },
  {
    title: "每日私訊價格報告",
    command: "/price-report settings",
    description: "設定每日台北發送時間、分類、關鍵字與內容；報告傳到你的 DM。",
  },
  {
    title: "公開價格報告",
    command: "/public-report manage",
    description: "具備「管理伺服器」權限的成員可指定公開報告頻道。",
  },
] as const;

// /watch 指令教學內容，說明目標價提醒的設定流程。
export const targetPriceCommandGuides = [
  {
    command: "/watch",
    description: "查看追蹤清單，新增、修改或移除單一商品的目標價。",
    image: {
      alt: "/watch 目標價提醒面板截圖",
      height: 530,
      orientation: "square",
      src: "/images/discord/watch-command-setting.png",
      width: 534,
    },
    title: "管理目標價提醒",
  },
  {
    command: "新增追蹤",
    description: "貼上商品頁網址並填入目標價；達標時 bot 會嘗試透過 DM 傳送提醒。",
    image: {
      alt: "新增追蹤視窗截圖",
      height: 456,
      orientation: "square",
      src: "/images/discord/watch-add-new-product.png",
      width: 477,
    },
    title: "新增目標價提醒",
  },
] as const;

// /price-report 指令教學內容，說明即時價格報告與每日私訊價格報告。
export const personalReportCommandGuides = [
  {
    command: "/price-report now",
    description: "在目前伺服器頻道或 DM 立即取得一次 6、12 或 24 小時價格變動。",
    image: {
      alt: "即時價格報告預覽截圖",
      height: 760,
      orientation: "portrait",
      src: "/images/discord/price-report-now.png",
      width: 532,
    },
    title: "查看即時價格報告",
  },
  {
    command: "/price-report settings",
    description: "設定每日台北發送時間、分類、關鍵字與內容；報告與預覽會傳到你的 DM。",
    image: {
      alt: "每日私訊價格報告設定截圖",
      height: 580,
      orientation: "portrait",
      src: "/images/discord/price-report-settings.png",
      width: 463,
    },
    title: "設定每日私訊價格報告",
  },
] as const;

// /public-report 指令教學內容，說明公開價格報告的管理者操作流程。
export const serverReportCommandGuides = [
  {
    command: "/public-report manage",
    description: "具備「管理伺服器」權限的成員可設定頻道、分類、關鍵字與啟用狀態。",
    image: {
      alt: "公開價格報告管理面板截圖",
      height: 571,
      orientation: "portrait",
      src: "/images/discord/public-report-manage.png",
      width: 490,
    },
    title: "設定公開價格報告",
  },
  {
    command: "/public-report test",
    description:
      "送出單次測試，確認 bot 具備「傳送訊息」與「嵌入連結」權限；失敗不會自動重試，也不會改變排程進度。",
    image: {
      alt: "公開價格報告測試截圖",
      height: 761,
      orientation: "portrait",
      src: "/images/discord/public-report-test.png",
      width: 526,
    },
    title: "測試公開價格報告",
  },
  {
    command: "/public-report status",
    description: "查看公開價格報告的啟用狀態、頻道與最近一次發送結果。",
    image: {
      alt: "公開價格報告狀態截圖",
      height: 314,
      orientation: "landscape",
      src: "/images/discord/public-report-status.png",
      width: 372,
    },
    title: "檢查公開價格報告",
  },
] as const;

// Discord 頁面常見問題，只保留邀請、權限與私訊提醒相關的使用者阻塞點。
export const discordFaqItems = [
  {
    question: "一般成員能用哪些指令？",
    answer:
      "一般成員可使用 /watch、/price-report 與 /bot help；/public-report 只限伺服器，且需要「管理伺服器」權限。",
  },
  {
    question: "看不到 /public-report 怎麼辦？",
    answer:
      "請確認帳號具備「管理伺服器」權限；若指令可開啟但無法發送，請確認 bot 在目標頻道具備「傳送訊息」與「嵌入連結」權限。",
  },
  {
    question: "收不到私訊提醒怎麼辦？",
    answer: "請允許此伺服器成員傳送私訊，或先傳訊息給 PartsRadarTW bot 後再試一次。",
  },
] as const;
