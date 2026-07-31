// packages/db/src/product-facets/index.ts
// 公開有限 product facet availability query，避免 API materialize product rows。

export {
  type ProductFacetAvailabilityClient,
  readAvailableProductFacetTags,
} from "./availability";
