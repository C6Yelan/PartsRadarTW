// apps/web/app/product-explorer/data/use-categories.ts
// 載入商品探索頁使用的來源分類清單，並提供分類篩選所需的載入狀態。

import { useEffect, useState } from "react";
import { fetchCategories } from "../api";
import type { CategoryItem, LoadState } from "../types";

// 在商品探索頁掛載後抓取分類 API，卸載時中止 request 避免更新失效狀態。
export function useCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryState, setCategoryState] = useState<LoadState>("idle");

  useEffect(() => {
    const controller = new AbortController();
    setCategoryState("loading");

    fetchCategories(controller.signal)
      .then((items) => {
        setCategories(items);
        setCategoryState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryState("error");
      });

    return () => controller.abort();
  }, []);

  return {
    categories,
    categoryState,
  };
}
