// apps/web/app/api/product-images/handler.ts
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
export { createPublicProductImagePath } from "@partsradar/shared";

import { internalErrorResponse, notFoundResponse } from "../_shared/responses";

const PRODUCT_IMAGE_CONTENT_TYPE = "image/webp";
const PRODUCT_IMAGE_CACHE_CONTROL = "public, max-age=3600";
const PRODUCT_IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PRODUCT_IMAGE_STORAGE_DIR = "../../storage/product-images";

type ProductImageReadFile = (path: string) => Promise<Uint8Array>;

export interface ProductImageHandlerOptions {
  storageDir?: string;
  readImageFile?: ProductImageReadFile;
}

export function createGetProductImageHandler(
  options: ProductImageHandlerOptions = {},
): (imageId: string) => Promise<Response> {
  const storageDir = resolveProductImageStorageDir(options.storageDir);
  const readImageFile = options.readImageFile ?? readFile;

  return async (imageId) => {
    const normalizedImageId = normalizeProductImageId(imageId);

    if (!normalizedImageId) {
      return notFoundResponse();
    }

    try {
      const bytes = await readImageFile(createProductImagePath(storageDir, normalizedImageId));

      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "Cache-Control": PRODUCT_IMAGE_CACHE_CONTROL,
          "Content-Length": String(bytes.byteLength),
          "Content-Type": PRODUCT_IMAGE_CONTENT_TYPE,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return notFoundResponse();
      }

      return internalErrorResponse();
    }
  };
}

function normalizeProductImageId(imageId: string): string | null {
  const value = imageId.trim().toLowerCase();
  const normalizedValue = value.endsWith(".webp") ? value.slice(0, -".webp".length) : value;

  return PRODUCT_IMAGE_ID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

function resolveProductImageStorageDir(storageDir: string | undefined): string {
  const value =
    storageDir ?? process.env.PRODUCT_IMAGE_STORAGE_DIR ?? DEFAULT_PRODUCT_IMAGE_STORAGE_DIR;
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error("Product image storage directory must not be empty.");
  }

  // Resolve once at handler construction so request-time path building only joins a validated UUID.
  return resolve(trimmedValue);
}

function createProductImagePath(storageDir: string, imageId: string): string {
  return join(storageDir, `${imageId}.webp`);
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
