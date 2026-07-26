// apps/web/app/discord/content.ts
// 依一般使用者與伺服器管理員分組 Discord 指令摘要。

export const userCommands = [
  {
    command: "/watch",
    purpose: "目標價提醒",
    result: "價格達標時嘗試傳送 DM",
  },
  {
    command: "/price-report now",
    purpose: "立即取得近期價格變動",
    result: "回覆在目前頻道或 DM",
  },
  {
    command: "/price-report settings",
    purpose: "每日私訊價格報告",
    result: "依設定時間傳送 DM",
  },
  {
    command: "/bot help",
    purpose: "查看指令使用說明",
    result: "顯示只有自己看得到的說明面板",
  },
] as const;

export const adminCommands = [
  {
    command: "/public-report settings",
    purpose: "設定公開價格報告",
    result: "指定頻道、篩選條件、測試與啟用狀態",
  },
  {
    command: "/status",
    purpose: "查看排程與背景工作狀態",
    result: "顯示最近執行、下次執行與處理摘要",
  },
] as const;

export const discordFaqItems = [
  {
    question: "一般成員能用哪些指令？",
    answer:
      "一般成員可使用 /watch、/price-report 與 /bot help；/public-report settings 與 /status 只限伺服器，且需要「管理伺服器」權限。",
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
