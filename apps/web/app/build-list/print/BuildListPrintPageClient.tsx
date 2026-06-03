"use client";
// apps/web/app/build-list/print/BuildListPrintPageClient.tsx

import Link from "next/link";
import { formatBuildListExportDateTime, formatBuildListPrice } from "../formatting";
import {
  getBuildListLineSubtotal,
  summarizeBuildList,
  type BuildListItem,
} from "../model";
import { useBuildList } from "../use-build-list";

export default function BuildListPrintPageClient() {
  const { isReady, items } = useBuildList();
  const summary = summarizeBuildList(items);

  return (
    <main className="build-list-print-shell">
      <nav className="print-toolbar" aria-label="列印操作">
        <Link className="back-link" href="/build-list">
          返回配單
        </Link>
        <button className="control-button primary" type="button" onClick={() => window.print()}>
          列印 / 儲存 PDF
        </button>
      </nav>

      <article className="print-document" aria-label="PartsRadarTW 配單列印版">
        <header className="print-document-header">
          <div>
            <p>PartsRadarTW</p>
            <h1>配單列印版</h1>
          </div>
        </header>

        {!isReady ? (
          <section className="print-empty">
            <h2>配單載入中</h2>
          </section>
        ) : null}

        {isReady && items.length === 0 ? (
          <section className="print-empty">
            <h2>配單目前沒有品項</h2>
            <p>請先從商品列表或商品詳細頁加入品項。</p>
          </section>
        ) : null}

        {isReady && items.length > 0 ? (
          <>
            <table className="print-items-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="print-cell-content">分類</span>
                  </th>
                  <th scope="col">
                    <span className="print-cell-content">商品名稱</span>
                  </th>
                  <th scope="col">
                    <span className="print-cell-content">數量</span>
                  </th>
                  <th scope="col">
                    <span className="print-cell-content">目前價格</span>
                  </th>
                  <th scope="col">
                    <span className="print-cell-content">小計</span>
                  </th>
                  <th scope="col">
                    <span className="print-cell-content">價格更新時間</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <PrintItemRow item={item} key={item.id} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2} scope="row">
                    <span className="print-cell-content">總計</span>
                  </th>
                  <td>
                    <span className="print-cell-content">{summary.totalQuantity}</span>
                  </td>
                  <td>
                    <span className="print-cell-content" aria-hidden="true" />
                  </td>
                  <td>
                    <span className="print-cell-content">
                      {formatBuildListPrice(summary.totalAmount)}
                    </span>
                  </td>
                  <td>
                    <span className="print-cell-content" aria-hidden="true" />
                  </td>
                </tr>
              </tfoot>
            </table>

            <section className="print-link-list" aria-label="購買與介紹網址">
              <h2>原價屋查看 / 購買網址</h2>
              <ol>
                {items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    <a href={item.source.url}>{item.source.url}</a>
                    {item.introductionUrl ? (
                      <a href={item.introductionUrl}>{item.introductionUrl}</a>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : null}

        <footer className="print-disclaimer">
          PartsRadarTW 是非官方、非商業的商品搜尋與價格整理工具。價格以網站最後收錄資料為準；實際商品資訊、價格、庫存、購買與售後服務以原價屋來源頁為準。
        </footer>
      </article>
    </main>
  );
}

function PrintItemRow({ item }: { item: BuildListItem }) {
  return (
    <tr>
      <td>
        <span className="print-cell-content">{item.category.displayName}</span>
      </td>
      <td>
        <span className="print-cell-content">{item.name}</span>
      </td>
      <td>
        <span className="print-cell-content">{item.quantity}</span>
      </td>
      <td>
        <span className="print-cell-content">{formatBuildListPrice(item.price.amount)}</span>
      </td>
      <td>
        <span className="print-cell-content">
          {formatBuildListPrice(getBuildListLineSubtotal(item))}
        </span>
      </td>
      <td>
        <span className="print-cell-content">
          {formatBuildListExportDateTime(item.price.lastSeenAt)}
        </span>
      </td>
    </tr>
  );
}
