// Shared safety boundary for product-name classification and facet extraction.
// Saved CoolPC fixtures currently peak at 70 UTF-16 code units; 512 keeps more
// than seven times that observed headroom while bounding every matching rule.
export const MAX_PRODUCT_NAME_LENGTH = 512;

export function normalizeBoundedProductName(productName: string): string | null {
  if (productName.length > MAX_PRODUCT_NAME_LENGTH) {
    return null;
  }

  const normalizedName = productName.normalize("NFKC");
  return normalizedName.length <= MAX_PRODUCT_NAME_LENGTH ? normalizedName : null;
}
