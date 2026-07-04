# 第三版 Roadmap

本文件只保留第三版目前仍有效的產品範圍、非目標與 current contract 入口。第三版原始規劃、切片紀錄與 closeout 背景已移至 [第三版 Roadmap Original](../archive/v3-roadmap-original.md)。

## 現行範圍

第三版目前收斂成三條主線：

- 商品詳細頁分享與 Open Graph preview。
- Discord bot 公開價格變動報告、個人目標價提醒與個人價格變動報告。
- 受保護的內網 ops status page、production smoke、admin webhook、外部 public-only monitoring 與公開流量硬化。

## 現行契約

- Discord bot 指令、通知、資料保存與隱私邊界以 [Discord Contract](../technical/discord-contract.md) 為準。
- Ops status、production smoke、admin webhook 與外部監控邊界以 [Ops Contract](../technical/ops-contract.md) 為準。
- 產品非目標與 accountless 邊界以 [產品邊界](product-boundary.md) 為準。
- 部署與維運命令以 [部署設計](../technical/deployment.md)、[Operations Runbook](../technical/operations-runbook.md) 與 [外部監控](../technical/external-monitoring.md) 為準。

## 非目標

第三版目前不做：

- 網站帳號、登入、網站端 watchlist、email 通知或跨平台帳號綁定。
- Discord 內保存配單、庫存 / 到貨通知、購買建議、完整商品搜尋 bot、分類缺漏提示、規格資料、相容性檢查或自動推薦配單。
- 分享配單 server-side token / snapshot / retention。
- 公開服務狀態推播或公開服務狀態頁。

上述項目若要重啟，需另開產品與資安設計，不從本 roadmap 自動延伸。

## 待決定

- 分享配單是否重啟；若重啟，需先確認使用者價值是否高於 Excel / 截圖分享。
- 公開服務狀態頁或公開狀態推播是否重啟；若重啟，需先確認一般使用者是否真的需要。
- 外部監控工具選型與部署位置。
- Discord price report 的預設每日發送時間。
- `/watch` 未來是否支援原價屋 URL 或 Discord 內搜尋商品。
