// packages/shared/src/product-facets.ts
// 維持 product facets 的既有公共匯入路徑與符號集合。

export { extractProductFilterTags } from "./product-facets/extraction";
export type {
  ParsedProductFilterTag,
  ProductFacetDefinition,
  ProductFacetOption,
} from "./product-facets/registry";
export {
  getProductFacetDefinitions,
  getPublicProductFacetDefinitions,
  isProductFilterTagSupported,
  mergeProductFilterTags,
  PRODUCT_FACET_IGRPS,
  parseProductFilterTag,
} from "./product-facets/registry";
