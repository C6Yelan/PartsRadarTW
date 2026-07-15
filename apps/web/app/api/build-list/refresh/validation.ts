// apps/web/app/api/build-list/refresh/validation.ts
// 驗證批次 refresh request 的 URL、content type、body bytes、UUID 與品項上限。

import { normalizeProductId } from "../../../_shared/product-id";
import { MAX_BUILD_LIST_PRODUCTS } from "../../../build-list/constants";

export const MAX_BUILD_LIST_REFRESH_BODY_BYTES = 4096;

export async function parseBuildListRefreshRequest(request: Request): Promise<string[] | null> {
  if (
    new URL(request.url).search !== "" ||
    !isJsonContentType(request.headers.get("Content-Type")) ||
    contentLengthExceedsLimit(request.headers.get("Content-Length"))
  ) {
    return null;
  }

  const rawBody = await readBoundedRequestBody(request);

  if (!rawBody) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!Array.isArray(value) || value.length > MAX_BUILD_LIST_PRODUCTS) {
    return null;
  }

  const normalizedProductIds: string[] = [];
  const seenProductIds = new Set<string>();

  for (const productId of value) {
    const normalizedProductId = normalizeProductId(productId);

    if (!normalizedProductId) {
      return null;
    }

    if (!seenProductIds.has(normalizedProductId)) {
      seenProductIds.add(normalizedProductId);
      normalizedProductIds.push(normalizedProductId);
    }
  }

  return normalizedProductIds;
}

function isJsonContentType(contentType: string | null): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function contentLengthExceedsLimit(contentLength: string | null): boolean {
  if (!contentLength) {
    return false;
  }

  const trimmedContentLength = contentLength.trim();

  return (
    !/^\d+$/.test(trimmedContentLength) ||
    Number.parseInt(trimmedContentLength, 10) > MAX_BUILD_LIST_REFRESH_BODY_BYTES
  );
}

async function readBoundedRequestBody(request: Request): Promise<string | null> {
  if (!request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      byteLength += value.byteLength;

      if (byteLength > MAX_BUILD_LIST_REFRESH_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
