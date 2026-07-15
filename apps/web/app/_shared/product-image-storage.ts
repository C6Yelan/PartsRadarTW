// apps/web/app/_shared/product-image-storage.ts
// 只從受信任的站內 storage root 讀取通過 UUID 驗證的商品 WebP 快取。

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { normalizeProductId } from "./product-id";

const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "../../storage/product-images";

export interface ProductImageStorageOptions {
  storageDir?: string;
  readImageFile?: (path: string) => Promise<Uint8Array>;
}

export async function readCachedProductImage(
  productId: unknown,
  options: ProductImageStorageOptions = {},
): Promise<Uint8Array | null> {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return null;
  }

  const storageDir = resolveProductImageStorageDir(options.storageDir);
  const readImageFile = options.readImageFile ?? readFile;

  try {
    return await readImageFile(createProductImagePath(storageDir, normalizedProductId));
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function resolveProductImageStorageDir(storageDir: string | undefined): string {
  const value =
    storageDir ?? process.env.PRODUCT_IMAGE_STORAGE_DIR ?? DEFAULT_PRODUCT_IMAGE_STORAGE_DIR;
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error("Product image storage directory must not be empty.");
  }

  return resolve(trimmedValue);
}

function createProductImagePath(storageDir: string, productId: string): string {
  return join(storageDir, `${productId}.webp`);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
