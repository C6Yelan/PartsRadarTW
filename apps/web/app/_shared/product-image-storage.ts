// apps/web/app/_shared/product-image-storage.ts
// 只從受信任的站內 storage root 讀取通過 UUID 驗證的商品 WebP 快取。

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { normalizeProductId } from "./product-id";

const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "../../storage/product-images";

export interface ProductImageStorageOptions {
  storageDir?: string;
  readImageFile?: (path: string) => Promise<Uint8Array>;
  readImageMetadata?: (path: string) => Promise<ProductImageFileMetadata>;
}

export interface ProductImageFileMetadata {
  byteLength: number;
  version: string;
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

export async function readCachedProductImageMetadata(
  productId: unknown,
  options: ProductImageStorageOptions = {},
): Promise<ProductImageFileMetadata | null> {
  const normalizedProductId = normalizeProductId(productId);

  if (!normalizedProductId) {
    return null;
  }

  const storageDir = resolveProductImageStorageDir(options.storageDir);
  const readImageMetadata = options.readImageMetadata ?? readProductImageFileMetadata;

  try {
    const metadata = await readImageMetadata(
      createProductImagePath(storageDir, normalizedProductId),
    );

    if (
      !Number.isSafeInteger(metadata.byteLength) ||
      metadata.byteLength < 0 ||
      metadata.version.length === 0
    ) {
      throw new Error("Product image metadata is invalid.");
    }

    return metadata;
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

async function readProductImageFileMetadata(path: string): Promise<ProductImageFileMetadata> {
  const metadata = await stat(path, { bigint: true });

  if (!metadata.isFile() || metadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Product image cache entry is not a supported file.");
  }

  return {
    byteLength: Number(metadata.size),
    version: `${metadata.ino}:${metadata.size}:${metadata.mtimeNs}`,
  };
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
