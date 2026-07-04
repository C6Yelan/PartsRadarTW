// apps/web/app/product-explorer/data/use-categories.ts
import { useEffect, useState } from "react";
import { fetchCategories } from "../api";
import type { CategoryItem, LoadState } from "../types";

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
