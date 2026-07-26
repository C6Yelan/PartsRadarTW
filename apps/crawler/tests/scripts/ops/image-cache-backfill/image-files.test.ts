// 驗證 CoolPC 圖片 transport 的 redirect、來源、timeout、Content-Type 與 byte limit。

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSourceImageBytes } from "../../../../src/scripts/ops/image-cache-backfill/image-files";
import {
  cleanupTempRoots,
  createOptions,
  createTempRoot,
} from "./image-cache-backfill-processor.support";

describe("source image fetch safety", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanupTempRoots(tempRoots);
  });

  it("follows a valid same-source redirect and returns bounded image bytes", async () => {
    const root = await createTempRoot(tempRoots);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/eval/4/final.webp" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "content-type": "image/webp",
            "content-length": "3",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSourceImageBytes(
        "https://www.coolpc.com.tw/eval/4/original.jpg",
        createOptions({
          storageDir: root,
          sourceImageFetchLockDir: `${root}/source-lock`,
          maxSourceBytes: 3,
        }),
      ),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a cross-host redirect before contacting its destination", async () => {
    const root = await createTempRoot(tempRoots);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/internal.png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchSourceImageBytes(
        "https://www.coolpc.com.tw/eval/4/original.jpg",
        createOptions({
          storageDir: root,
          sourceImageFetchLockDir: `${root}/source-lock`,
        }),
      ),
    ).rejects.toMatchObject({
      kind: "source_policy",
      message: "CoolPC source origin rejected.",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects missing or non-image Content-Type", async () => {
    const root = await createTempRoot(tempRoots);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not an image", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(
      fetchSourceImageBytes(
        "https://www.coolpc.com.tw/eval/4/source.jpg",
        createOptions({
          storageDir: root,
          sourceImageFetchLockDir: `${root}/source-lock`,
        }),
      ),
    ).rejects.toMatchObject({ kind: "content_type" });
  });

  it("stops streaming as soon as the image byte limit is exceeded", async () => {
    const root = await createTempRoot(tempRoots);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body, { headers: { "content-type": "image/png" } })),
    );

    await expect(
      fetchSourceImageBytes(
        "https://www.coolpc.com.tw/eval/4/source.png",
        createOptions({
          storageDir: root,
          sourceImageFetchLockDir: `${root}/source-lock`,
          maxSourceBytes: 5,
        }),
      ),
    ).rejects.toMatchObject({ kind: "too_large" });
    expect(cancelled).toBe(true);
  });

  it("aborts the complete redirect chain at the configured timeout", async () => {
    const root = await createTempRoot(tempRoots);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );

    await expect(
      fetchSourceImageBytes(
        "https://www.coolpc.com.tw/eval/4/source.jpg",
        createOptions({
          storageDir: root,
          sourceImageFetchLockDir: `${root}/source-lock`,
          timeoutMs: 5,
        }),
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
});
