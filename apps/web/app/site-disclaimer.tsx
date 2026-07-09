// apps/web/app/site-disclaimer.tsx
// 提供全站共用的資料來源與非官方聲明，避免各頁重複維護相同邊界文字。

// 顯示 PartsRadarTW 與原價屋來源資料的關係，固定放在主要公開頁面底部。
export default function SiteDisclaimer() {
  return (
    <footer className="site-disclaimer">
      <p>
        PartsRadarTW
        是非官方、非商業的商品搜尋與價格整理工具。資料來源為原價屋公開頁面；實際商品資訊、價格、庫存、購買與售後服務以原價屋來源頁為準。
      </p>
      <p>
        本站僅整理必要的商品查詢資訊，不複製完整商品文案、完整頁面內容或原站排版。
      </p>
    </footer>
  );
}
