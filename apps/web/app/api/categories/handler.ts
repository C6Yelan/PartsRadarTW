// apps/web/app/api/categories/handler.ts
// 處理公開分類 API 的 enabled sourceCategory 讀取、slug mapping 與安全 JSON 回應。

import { getPublicProductFacetDefinitions, type ProductFacetDefinition } from "@partsradar/shared";

import { type CategorySlug, getCategorySlug } from "../../category-slugs";
import { internalErrorResponse, jsonOk } from "../_shared/responses";

interface CategoryRecord {
  id: string;
  igrp: number;
  displayName: string;
  sourceName: string;
}

interface CategoryFindManyArgs {
  where: {
    enabled: true;
  };
  orderBy: {
    igrp: "asc";
  };
  select: {
    id: true;
    igrp: true;
    displayName: true;
    sourceName: true;
  };
}

export interface CategoriesReadClient {
  sourceCategory: {
    findMany(args: CategoryFindManyArgs): Promise<CategoryRecord[]>;
  };
  readAvailableProductFacetTags(igrp: number): Promise<readonly string[]>;
}

interface CategoryResponseItem {
  id: string;
  slug: CategorySlug;
  displayName: string;
  sourceName: string;
  facets: readonly ProductFacetDefinition[];
}

interface CategoriesResponseBody {
  data: CategoryResponseItem[];
}

// 建立分類列表 API handler，只公開已啟用分類與前端篩選實際使用的欄位。
export function createGetCategoriesHandler(client: CategoriesReadClient): () => Promise<Response> {
  return async () => {
    try {
      const categories = await client.sourceCategory.findMany({
        where: { enabled: true },
        orderBy: { igrp: "asc" },
        select: {
          id: true,
          igrp: true,
          displayName: true,
          sourceName: true,
        },
      });
      const ssdFacetTags = categories.some((category) => category.igrp === 7)
        ? new Set(await client.readAvailableProductFacetTags(7))
        : undefined;

      return jsonOk<CategoriesResponseBody>({
        data: categories.map((category) => toCategoryResponseItem(category, ssdFacetTags)),
      });
    } catch {
      return internalErrorResponse();
    }
  };
}

// 將 DB category row 轉成 public slug；未登錄的 enabled IGrp 視為 server contract error。
function toCategoryResponseItem(
  category: CategoryRecord,
  availableSsdTags?: ReadonlySet<string>,
): CategoryResponseItem {
  const slug = getCategorySlug(category.igrp);

  if (!slug) {
    throw new Error("Enabled category is missing a public slug mapping.");
  }

  return {
    id: category.id,
    slug,
    displayName: category.displayName,
    sourceName: category.sourceName,
    facets: getPublicProductFacetDefinitions(category.igrp, availableSsdTags),
  };
}
