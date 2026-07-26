// 驗證 CoolPC HTML／圖片 transport 每一跳都維持固定 HTTPS origin 與各自 path policy。

import { describe, expect, it, vi } from "vitest";
import {
  assertCoolpcHtmlContentType,
  fetchCoolpcSource,
  MAX_COOLPC_REDIRECTS,
  type CoolpcSourceKind,
} from "../../src/coolpc/source-fetch";

describe("CoolPC source fetch policy", () => {
  it("follows a valid same-source category redirect with manual mode on every hop", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/eachview.php?IGrp=4&page=2" },
        }),
      )
      .mockResolvedValueOnce(htmlResponse("<html>ok</html>"));

    const response = await fetchCoolpcSource("https://www.coolpc.com.tw/eachview.php?IGrp=4", {
      kind: "category-html",
      fetchImpl,
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ redirect: "manual" });
    }
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      "https://www.coolpc.com.tw/eachview.php?IGrp=4&page=2",
    );
  });

  it("allows a same-source product image redirect within the image path policy", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "/eval/4/final.webp" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/webp" },
        }),
      );

    await expect(
      fetchCoolpcSource("https://www.coolpc.com.tw/eval/4/original.jpg", {
        kind: "product-image",
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["cross-host", "https://images.example.com/eachview.php?IGrp=4"],
    ["HTTP downgrade", "http://www.coolpc.com.tw/eachview.php?IGrp=4"],
    ["URL credentials", "https://user:secret@www.coolpc.com.tw/eachview.php?IGrp=4"],
    ["abnormal port", "https://www.coolpc.com.tw:8443/eachview.php?IGrp=4"],
    ["localhost", "https://localhost/eachview.php?IGrp=4"],
    ["private IPv4", "https://10.0.0.8/eachview.php?IGrp=4"],
    ["IPv6 loopback", "https://[::1]/eachview.php?IGrp=4"],
  ])("rejects a %s redirect before requesting its destination", async (_label, location) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location },
      }),
    );

    await expect(
      fetchCoolpcSource("https://www.coolpc.com.tw/eachview.php?IGrp=4", {
        kind: "category-html",
        fetchImpl,
      }),
    ).rejects.toThrow("CoolPC source origin rejected.");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a redirect loop", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/eachview.php?IGrp=4" },
      }),
    );

    await expect(
      fetchCoolpcSource("https://www.coolpc.com.tw/eachview.php?IGrp=4", {
        kind: "category-html",
        fetchImpl,
      }),
    ).rejects.toThrow("CoolPC source redirect loop rejected.");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a redirect chain beyond the fixed limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const current = new URL(String(input));
      const hop = Number(current.searchParams.get("hop") ?? "0");
      return new Response(null, {
        status: 302,
        headers: { location: `/evaluate.php?hop=${hop + 1}` },
      });
    });

    await expect(
      fetchCoolpcSource("https://www.coolpc.com.tw/evaluate.php?hop=0", {
        kind: "filter-html",
        fetchImpl,
      }),
    ).rejects.toThrow("CoolPC source redirect limit exceeded.");
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_COOLPC_REDIRECTS + 1);
  });

  it.each([
    ["category-html", "https://www.coolpc.com.tw/evaluate.php"],
    ["filter-html", "https://www.coolpc.com.tw/eachview.php?IGrp=4"],
    ["product-image", "https://www.coolpc.com.tw/evaluate.php"],
    ["product-image", "https://www.coolpc.com.tw/eval/4/not-an-image.txt"],
  ] satisfies Array<
    [CoolpcSourceKind, string]
  >)("keeps the %s path allowlist narrow", async (kind, url) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchCoolpcSource(url, { kind, fetchImpl })).rejects.toThrow(
      "CoolPC source path rejected.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts only HTML response content types", () => {
    expect(() => assertCoolpcHtmlContentType(htmlResponse("<html></html>"))).not.toThrow();
    expect(() =>
      assertCoolpcHtmlContentType(
        new Response("plain", { headers: { "content-type": "text/plain" } }),
      ),
    ).toThrow("CoolPC HTML response Content-Type is invalid.");
    expect(() => assertCoolpcHtmlContentType(new Response("missing"))).toThrow(
      "CoolPC HTML response Content-Type is invalid.",
    );
  });
});

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=big5" },
  });
}
