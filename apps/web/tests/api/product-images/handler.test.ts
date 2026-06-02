// apps/web/tests/api/product-images/handler.test.ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import {
  createGetProductImageHandler,
  createPublicProductImagePath,
} from "../../../app/api/product-images/handler";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const IMAGE_BYTES = Uint8Array.of(82, 73, 70, 70, 0, 0, 0, 0);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((tempDir) => rm(tempDir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("product image API helpers", () => {
  it("builds a public API path for product images", () => {
    // The API exposes cached images through an app route, not through raw storage paths.
    expect(createPublicProductImagePath(PRODUCT_ID.toUpperCase())).toBe(
      `/api/product-images/${PRODUCT_ID}.webp`,
    );
  });

  it("returns a cached webp image from the configured storage directory", async () => {
    const storageDir = await createTempDir();
    await writeFile(join(storageDir, `${PRODUCT_ID}.webp`), IMAGE_BYTES);

    const response = await createGetProductImageHandler({ storageDir })(`${PRODUCT_ID}.webp`);
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(response.headers.get("Content-Length")).toBe(String(IMAGE_BYTES.byteLength));
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(body).toEqual(IMAGE_BYTES);
  });

  it("normalizes the image id before reading from storage", async () => {
    let readPath: string | null = null;

    const response = await createGetProductImageHandler({
      storageDir: "/images",
      readImageFile: async (path) => {
        readPath = path;

        return IMAGE_BYTES;
      },
    })(`${PRODUCT_ID.toUpperCase()}.WEBP`);

    expect(response.status).toBe(200);
    expect(readPath).toBe(join(resolve("/images"), `${PRODUCT_ID}.webp`));
  });

  it("returns 404 for malformed image ids without reading storage", async () => {
    let readCallCount = 0;

    const response = await createGetProductImageHandler({
      storageDir: "/images",
      readImageFile: async () => {
        readCallCount += 1;

        return IMAGE_BYTES;
      },
    })("../product");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
    expect(readCallCount).toBe(0);
  });

  it("returns 404 when the cached image does not exist", async () => {
    const storageDir = await createTempDir();

    const response = await createGetProductImageHandler({ storageDir })(PRODUCT_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
  });

  it("returns a generic 500 response when storage read fails unexpectedly", async () => {
    const response = await createGetProductImageHandler({
      storageDir: "/images",
      readImageFile: async () => {
        throw Object.assign(new Error("permission denied for /images"), { code: "EACCES" });
      },
    })(PRODUCT_ID);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});

async function createTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "partsradar-product-images-"));
  tempDirs.push(tempDir);

  return tempDir;
}
