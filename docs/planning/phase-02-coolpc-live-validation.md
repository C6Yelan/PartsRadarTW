# Phase 2 CoolPC Live Validation

本文件記錄 Phase 2 parser fixture 階段的手動 live validation 結果。live fetch 只手動執行，不列入常規測試。

## Run

- Date: 2026-05-27
- Live command:

```bash
pnpm --filter @partsradar/crawler validate:coolpc-live -- --confirm-live-fetch --delay-ms 5000 --output-dir temp/coolpc-live-validation/phase-02-current
```

- Offline replay command:

```bash
pnpm --filter @partsradar/crawler validate:coolpc-live -- --from-raw-dir apps/crawler/temp/coolpc-live-validation/phase-02-current/raw --output-dir temp/coolpc-live-validation/phase-02-replay
```

第一輪 live fetch 的 raw HTML 保存在 ignored `apps/crawler/temp/coolpc-live-validation/phase-02-current/raw/`。修正 parser 與分類設定後，使用同一批 raw HTML 離線 replay，避免重複打來源站。

## Result

| Category | IGrp | Validation | div.w | div.t | div.x | Parsed | Deduped | Import |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| CPU | 4 | valid | 52 | 52 | 52 | 52 | 0 | yes |
| 主機板 | 5 | valid | 406 | 406 | 406 | 406 | 0 | yes |
| 記憶體 | 6 | valid | 262 | 262 | 262 | 262 | 0 | yes |
| SSD / HDD | 7 | valid | 202 | 202 | 202 | 202 | 0 | yes |
| 散熱器 | 10 | valid | 192 | 192 | 192 | 191 | 1 | yes |
| 顯示卡 | 12 | valid | 286 | 286 | 286 | 286 | 0 | yes |
| 機殼 | 14 | valid | 730 | 730 | 730 | 695 | 35 | yes |
| 電源供應器 | 15 | valid | 349 | 349 | 349 | 321 | 28 | yes |

## Findings

- `IGrp=7` 實際頁面標題為「內接硬碟HDD｜固態SSD」，可作為第一版內接儲存分類。
- `IGrp=8` 實際頁面標題為「外接硬碟｜隨身碟｜記憶卡」，不屬於第一版組電腦必要硬體；第一版不建立此分類資料，未來版本需要時再新增回來。
- `IGrp=10` 實際頁面標題使用「CPU散熱｜散熱墊｜散熱膏」，parser 需要接受 `CPU散熱` / `散熱` 類 title keyword。
- `IGrp=10`、`IGrp=14`、`IGrp=15` 會出現相同 `iBuyToken`、商品名稱與價格的重複列；parser 可去重。
- 若同一 `iBuyToken` 對應不同商品名稱或價格，仍視為來源商品識別衝突，該分類本次結果不可匯入正式商品資料。

## Follow-Up

- Phase 2 可繼續補更多離線 fixture，但不需要再重複 live fetch。
- Phase 3 寫入 DB 時，product upsert 應使用去重後的 parsed items。
- `IGrp=8` 若未來要支援外接儲存，作為後續擴充分類新增即可，不在第一版保留 disabled category。
