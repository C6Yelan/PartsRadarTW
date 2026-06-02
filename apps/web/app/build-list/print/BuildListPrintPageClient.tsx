"use client";
// apps/web/app/build-list/print/BuildListPrintPageClient.tsx

import Link from "next/link";
import { formatBuildListDateTime, formatBuildListPrice } from "../formatting";
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
          <dl>
            <div>
              <dt>品項</dt>
              <dd>{summary.itemCount}</dd>
            </div>
            <div>
              <dt>數量</dt>
              <dd>{summary.totalQuantity}</dd>
            </div>
            <div>
              <dt>總價</dt>
              <dd>{formatBuildListPrice(summary.totalAmount)}</dd>
            </div>
          </dl>
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
                  <th scope="col">分類</th>
                  <th scope="col">商品名稱</th>
                  <th scope="col">數量</th>
                  <th scope="col">目前價格</th>
                  <th scope="col">小計</th>
                  <th scope="col">價格更新時間</th>
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
                    總計
                  </th>
                  <td>{summary.totalQuantity}</td>
                  <td />
                  <td>{formatBuildListPrice(summary.totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>

            <section className="print-link-list" aria-label="購買與介紹網址">
              <h2>原價屋查看 / 購買網址</h2>
              <ol>
                {items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    <span>{item.source.url}</span>
                    {item.introductionUrl ? <span>{item.introductionUrl}</span> : null}
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
      <td>{item.category.displayName}</td>
      <td>{item.name}</td>
      <td>{item.quantity}</td>
      <td>{formatBuildListPrice(item.price.amount)}</td>
      <td>{formatBuildListPrice(getBuildListLineSubtotal(item))}</td>
      <td>{formatBuildListDateTime(item.price.lastSeenAt)}</td>
    </tr>
  );
}
