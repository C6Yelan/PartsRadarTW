# 文件目錄

本目錄只保留現行規格、技術契約與必要維運手冊。若文件內容衝突，優先順序為：

1. 現行程式碼與 migration。
2. `docs/planning/` 與 `docs/technical/` 中明確描述 current behavior 的文件。
3. roadmap / closeout / phase history；這些只作歷史背景，不是 runtime contract。

## 結構

```text
docs/
  README.md
  planning/             # 現行產品邊界、仍有效的決策、資料流；roadmap 需標示 current 或 history
  technical/            # 現行架構、API、crawler、DB、部署、安全、測試契約
  archive/              # 歷史 roadmap、closeout 與 phase evidence；不作 current runtime contract
```

## 文件責任

- 程式碼、Prisma schema 與 migration 是最終真相。
- current docs 只描述目前必須維持的行為、資料邊界、操作流程與驗證方式。
- roadmap 若包含已完成或暫停的內容，不能單獨當成目前規格使用；需回到 current docs 或程式碼確認。
- `PROJECT_CONTEXT.md` 是 local AI/context 筆記，不是 repo canonical docs。

## 現行規劃

- [產品邊界](planning/product-boundary.md)
- [決策紀錄](planning/decision-log.md)
- [第三版 Roadmap](planning/v3-roadmap.md)
- [資料流設計](planning/data-flow.md)

## 歷史紀錄

- [第二版 Closeout](archive/v2-closeout.md)
- [第三版 Roadmap Original](archive/v3-roadmap-original.md)
- [第一版實作 Roadmap History](archive/implementation-roadmap-history.md)

## 技術契約

- [技術選型](technical/tech-stack.md)
- [系統架構](technical/architecture.md)
- [命名約定](technical/naming-conventions.md)
- [Crawler 設計](technical/crawler-design.md)
- [資料模型](technical/data-model.md)
- [API 設計](technical/api-design.md)
- [Web UI 設計](technical/web-ui-design.md)
- [開發環境設定](technical/development-setup.md)
- [部署設計](technical/deployment.md)
- [Operations Runbook](technical/operations-runbook.md)
- [Ops Contract](technical/ops-contract.md)
- [Discord Contract](technical/discord-contract.md)
- [外部監控](technical/external-monitoring.md)
- [資安基準](technical/security.md)
- [測試策略](technical/testing-strategy.md)
