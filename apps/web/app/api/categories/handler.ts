import { COOLPC_SOURCE_NAME } from "@partsradar/shared";
import { internalErrorResponse, jsonOk } from "../_shared/responses";

interface CategoryRecord {
  id: string;
  igrp: number;
  displayName: string;
  sourceName: string;
  enabled: boolean;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
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
    enabled: true;
    lastCheckedAt: true;
    lastSuccessAt: true;
  };
}

export interface CategoriesReadClient {
  sourceCategory: {
    findMany(args: CategoryFindManyArgs): Promise<CategoryRecord[]>;
  };
}

interface CategoryResponseItem {
  id: string;
  source: typeof COOLPC_SOURCE_NAME;
  igrp: number;
  displayName: string;
  sourceName: string;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
}

interface CategoriesResponseBody {
  data: CategoryResponseItem[];
}

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
          enabled: true,
          lastCheckedAt: true,
          lastSuccessAt: true,
        },
      });

      return jsonOk<CategoriesResponseBody>({
        data: categories.map(toCategoryResponseItem),
      });
    } catch {
      return internalErrorResponse();
    }
  };
}

function toCategoryResponseItem(category: CategoryRecord): CategoryResponseItem {
  return {
    id: category.id,
    source: COOLPC_SOURCE_NAME,
    igrp: category.igrp,
    displayName: category.displayName,
    sourceName: category.sourceName,
    enabled: category.enabled,
    lastCheckedAt: toIsoStringOrNull(category.lastCheckedAt),
    lastSuccessAt: toIsoStringOrNull(category.lastSuccessAt),
  };
}

function toIsoStringOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
