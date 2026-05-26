const categories = ["CPU", "主機板", "記憶體", "顯示卡", "SSD / HDD", "電源供應器"];

export default function HomePage() {
  return (
    <main
      style={{
        width: "min(1120px, calc(100% - 32px))",
        margin: "0 auto",
        padding: "32px 0",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.2 }}>PartsRadarTW</h1>
      </header>

      <section
        aria-label="商品查詢"
        style={{
          display: "grid",
          gap: 12,
          padding: 16,
          border: "1px solid #d8dde6",
          borderRadius: 8,
          background: "#ffffff",
        }}
      >
        <input
          aria-label="商品關鍵字"
          placeholder="搜尋商品名稱"
          style={{
            width: "100%",
            minHeight: 44,
            border: "1px solid #c7ced9",
            borderRadius: 6,
            padding: "0 12px",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <select
            aria-label="分類"
            defaultValue=""
            style={{
              minHeight: 40,
              border: "1px solid #c7ced9",
              borderRadius: 6,
              padding: "0 10px",
              background: "#ffffff",
            }}
          >
            <option value="">全部分類</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            aria-label="排序"
            defaultValue="price_asc"
            style={{
              minHeight: 40,
              border: "1px solid #c7ced9",
              borderRadius: 6,
              padding: "0 10px",
              background: "#ffffff",
            }}
          >
            <option value="price_asc">價格低到高</option>
            <option value="price_desc">價格高到低</option>
            <option value="updated_desc">最近更新</option>
          </select>
        </div>
      </section>

      <section
        aria-label="商品列表"
        style={{
          marginTop: 20,
          border: "1px solid #d8dde6",
          borderRadius: 8,
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 160px",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid #e6e9ef",
            color: "#4c5668",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>商品</span>
          <span>分類</span>
          <span>價格</span>
        </div>
        <div style={{ padding: 16, color: "#657085" }}>尚未載入商品資料</div>
      </section>
    </main>
  );
}
