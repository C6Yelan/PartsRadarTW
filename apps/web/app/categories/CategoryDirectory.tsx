// apps/web/app/categories/CategoryDirectory.tsx
// 在首頁提供 crawler 與使用者都能直接跟隨的正式分類連結。

import Link from "next/link";
import { CATEGORY_MAPPINGS } from "../category-slugs";

export default function CategoryDirectory() {
  return (
    <nav className="public-info-section category-directory" aria-label="商品分類">
      <h2>依分類瀏覽</h2>
      <ul className="public-info-section-list category-directory-links">
        {CATEGORY_MAPPINGS.map((category) => (
          <li key={category.slug}>
            <Link href={`/categories/${category.slug}`}>{category.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
