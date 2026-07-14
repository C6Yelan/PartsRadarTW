// apps/web/app/discord/content.ts
// 依一般使用者與伺服器管理員分組 Discord 教學文案與截圖 metadata。

export const heroScreenshot = {
  alt: "Discord 指令選單截圖",
  height: 377,
  src: "/images/discord/commands-screenshot.png",
  width: 1218,
} as const;

export const screenshotFreshnessNotice =
  "文字說明反映目前功能；操作截圖為較早版本介面示意，部分欄位與指令文字可能不同。";

export const userQuickStartSteps = [
  {
    title: "邀請機器人",
    command: "邀請連結",
    description: "將 PartsRadarTW bot 加入伺服器，或在已安裝 bot 的伺服器開始使用。",
  },
  {
    title: "選擇立即功能",
    command: "/watch 或 /price-report now",
    description: "設定商品目標價提醒，或立即取得近期價格變動。",
  },
  {
    title: "設定每日報告",
    command: "/price-report settings",
    description: "需要每日報告時，設定台北發送時間、分類、關鍵字與內容。",
  },
] as const;

export const adminQuickStartSteps = [
  {
    title: "確認權限",
    command: "管理伺服器 + 頻道權限",
    description: "使用者需有「管理伺服器」權限；bot 在目標頻道需能傳送訊息與嵌入連結。",
  },
  {
    title: "設定公開報告",
    command: "/public-report manage",
    description: "選擇公開報告頻道、分類、關鍵字與啟用狀態。",
  },
  {
    title: "測試並檢查",
    command: "/public-report test → /public-report status",
    description: "送出單次測試，再確認啟用狀態、頻道與最近一次發送結果。",
  },
] as const;

export const userCommandGuides = [
  {
    command: "/watch",
    purpose: "目標價提醒",
    result: "價格達標時嘗試傳送 DM",
    title: "追蹤商品目標價",
    sections: [
      {
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
    ],
  },
  {
    command: "/price-report now",
    purpose: "立即取得近期價格變動",
    result: "回覆在目前頻道或 DM",
    title: "查看即時價格報告",
    sections: [
      {
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
    ],
  },
  {
    command: "/price-report settings",
    purpose: "每日私訊價格報告",
    result: "依設定時間傳送 DM",
    title: "設定每日私訊報告",
    sections: [
      {
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
    ],
  },
] as const;

export const adminCommandGuides = [
  {
    command: "/public-report manage",
    purpose: "設定公開價格報告",
    result: "指定頻道、篩選條件與啟用狀態",
    title: "設定公開價格報告",
    sections: [
      {
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
    ],
  },
  {
    command: "/public-report test",
    purpose: "測試 bot 權限與設定",
    result: "發送單次測試，不推進排程進度",
    title: "測試公開價格報告",
    sections: [
      {
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
    ],
  },
  {
    command: "/public-report status",
    purpose: "檢查公開報告狀態",
    result: "查看頻道與最近一次發送結果",
    title: "檢查公開價格報告",
    sections: [
      {
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
    ],
  },
] as const;

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
