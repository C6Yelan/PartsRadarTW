# 文件目錄

本目錄只保留現行規格與技術契約。若文件內容衝突，優先順序為：

1. 現行程式碼與 migration。
2. `docs/planning/` 與 `docs/technical/` 的 current docs。

## 結構

```text
docs/
  README.md
  planning/             # 現行產品邊界、決策、roadmap、資料流
  technical/            # 現行架構、API、crawler、DB、部署、安全、測試契約
```

## 現行規劃

- [產品邊界](planning/product-boundary.md)
- [決策紀錄](planning/decision-log.md)
- [實作 Roadmap](planning/implementation-roadmap.md)
- [第二版 Roadmap](planning/v2-roadmap.md)
- [資料流設計](planning/data-flow.md)

## 技術契約

- [技術選型](technical/tech-stack.md)
- [系統架構](technical/architecture.md)
- [Crawler 設計](technical/crawler-design.md)
- [資料模型](technical/data-model.md)
- [API 設計](technical/api-design.md)
- [Web UI 設計](technical/web-ui-design.md)
- [開發環境設定](technical/development-setup.md)
- [部署設計](technical/deployment.md)
- [Operations Runbook](technical/operations-runbook.md)
- [資安基準](technical/security.md)
- [測試策略](technical/testing-strategy.md)
