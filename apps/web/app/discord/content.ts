// apps/web/app/discord/content.ts
export const heroScreenshot = {
  alt: "Discord 指令選單截圖",
  height: 377,
  src: "/images/discord/commands-screenshot.png",
  width: 1218,
} as const;

export const quickStartSteps = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description: "成員可使用 /watch、/price-report；管理者可設定 /public-report。",
  },
  {
    title: "即時目標價提醒",
    command: "/watch",
    description: "追蹤單一商品，價格更新後若達標就私訊提醒。",
  },
  {
    title: "個人價格報告",
    command: "/price-report settings",
    description: "設定分類與關鍵字，定時或手動產生個人彙整報告。",
  },
  {
    title: "伺服器公開報告",
    command: "/public-report manage",
    description: "管理者指定頻道，讓全伺服器看到公開彙整報告。",
  },
] as const;

export const targetPriceCommandGuides = [
  {
    command: "/watch",
    description: "查看追蹤清單，新增、修改或移除單一商品的目標價。",
    image: {
      alt: "/watch 即時目標價提醒面板截圖",
      height: 530,
      orientation: "square",
      src: "/images/discord/watch-command-setting.png",
      width: 534,
    },
    title: "管理即時目標價提醒",
  },
  {
    command: "新增追蹤",
    description: "貼上商品頁網址並填入目標價；價格更新後達標會私訊你。",
    image: {
      alt: "新增追蹤視窗截圖",
      height: 456,
      orientation: "square",
      src: "/images/discord/watch-add-new-product.png",
      width: 477,
    },
    title: "新增即時提醒",
  },
] as const;

export const personalReportCommandGuides = [
  {
    command: "/price-report settings",
    description: "設定只屬於自己的分類、商品關鍵字、內容類型與顯示上限。",
    image: {
      alt: "個人價格報告設定截圖",
      height: 580,
      orientation: "portrait",
      src: "/images/discord/price-report-settings.png",
      width: 463,
    },
    title: "設定個人價格報告",
  },
  {
    command: "/price-report now",
    description: "用目前設定手動產生一次 DM 報告，確認篩選結果是否正確。",
    image: {
      alt: "個人價格報告預覽截圖",
      height: 760,
      orientation: "portrait",
      src: "/images/discord/price-report-now.png",
      width: 532,
    },
    title: "預覽個人價格報告",
  },
] as const;

export const serverReportCommandGuides = [
  {
    command: "/public-report manage",
    description: "管理者設定公開頻道、分類、關鍵字與啟用狀態。",
    image: {
      alt: "伺服器公開報告管理面板截圖",
      height: 571,
      orientation: "portrait",
      src: "/images/discord/public-report-manage.png",
      width: 490,
    },
    title: "設定伺服器公開報告",
  },
  {
    command: "/public-report test",
    description: "送出測試報告，確認公開頻道權限與 embed 顯示正常。",
    image: {
      alt: "伺服器公開報告測試截圖",
      height: 761,
      orientation: "portrait",
      src: "/images/discord/public-report-test.png",
      width: 526,
    },
    title: "測試伺服器公開報告",
  },
  {
    command: "/public-report status",
    description: "查看伺服器公開報告的啟用狀態、頻道與最近一次發送結果。",
    image: {
      alt: "伺服器公開報告狀態截圖",
      height: 314,
      orientation: "landscape",
      src: "/images/discord/public-report-status.png",
      width: 372,
    },
    title: "檢查伺服器公開報告",
  },
] as const;

export const discordFaqItems = [
  {
    question: "一般成員能用哪些指令？",
    answer:
      "一般成員可使用 /watch 即時目標價提醒與 /price-report 個人價格報告；/public-report 只提供給管理者。",
  },
  {
    question: "看不到 /public-report 怎麼辦？",
    answer: "請確認帳號具備管理伺服器權限，並重新開啟 Discord 指令選單。",
  },
  {
    question: "收不到私訊提醒怎麼辦？",
    answer: "請允許伺服器成員傳送私訊，或先在伺服器內對 bot 使用 /watch 重新建立互動。",
  },
] as const;
