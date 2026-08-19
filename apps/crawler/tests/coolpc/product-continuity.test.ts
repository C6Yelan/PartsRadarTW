import { describe, expect, it } from "vitest";
import {
  findCoolpcContinuityMatches,
  isUsableCoolpcContinuityImageUrl,
  normalizeCoolpcContinuityName,
} from "../../src/coolpc/product-continuity";
import { productItem } from "./support/product-write-client";

describe("CoolPC product continuity", () => {
  it("normalizes only the allowed formatting changes and promotion labels", () => {
    const expected = normalizeCoolpcContinuityName("華碩 pro ws w680-ace（ATX /）");
    expect(normalizeCoolpcContinuityName("｛華碩 PRO WS W680-ACE｝ ATX / [裝機價]")).toBe(expected);
    expect(normalizeCoolpcContinuityName("華碩 PRO WS W680-ACE ATX / ~限組裝~")).toBe(expected);
    expect(normalizeCoolpcContinuityName("顯示卡 OC")).not.toBe(
      normalizeCoolpcContinuityName("顯示卡"),
    );
  });

  it("rejects empty and named placeholder images", () => {
    expect(isUsableCoolpcContinuityImageUrl(null)).toBe(false);
    expect(isUsableCoolpcContinuityImageUrl("https://www.coolpc.com.tw/eval/5/noimage.gif")).toBe(
      false,
    );
    expect(isUsableCoolpcContinuityImageUrl("https://www.coolpc.com.tw/eval/5/w680.jpg")).toBe(
      true,
    );
  });

  it("matches one absent old token by unique image, normalized name, and price", () => {
    const oldProduct = existingProduct({
      ibuyToken: "old-token",
      name: "華碩 PRO WS W680-ACE(ATX/DDR5)",
    });
    const parsed = productItem({
      ibuyToken: "new-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      price: 4880,
    });

    expect(findCoolpcContinuityMatches([parsed], [oldProduct]).get("new-token")?.id).toBe(
      "old-product",
    );
  });

  it.each([
    ["changed name", { name: "華碩 PRO WS W680-ACE ATX DDR4" }],
    ["changed price", { price: 4990 }],
    ["missing image", { primaryImageUrl: null }],
  ])("does not match when the %s differs", (_label, parsedOverrides) => {
    const oldProduct = existingProduct({ ibuyToken: "old-token" });
    const parsed = productItem({ ibuyToken: "new-token", price: 4880, ...parsedOverrides });

    expect(findCoolpcContinuityMatches([parsed], [oldProduct]).size).toBe(0);
  });

  it("keeps exact-token identity ahead of fallback", () => {
    const exact = existingProduct({ id: "exact-product", ibuyToken: "new-token" });
    const absent = existingProduct({ id: "absent-product", ibuyToken: "old-token" });
    const parsed = productItem({ ibuyToken: "new-token", price: 4880 });

    expect(findCoolpcContinuityMatches([parsed], [exact, absent]).size).toBe(0);
  });

  it("does not match an identical candidate from another source category", () => {
    const parsed = productItem({ ibuyToken: "new-token", price: 4880 });
    const otherCategory = existingProduct({
      ibuyToken: "old-token",
      sourceCategoryId: "category-5",
    });

    expect(findCoolpcContinuityMatches([parsed], [otherCategory]).size).toBe(0);
  });

  it("rejects image ambiguity on either side", () => {
    const parsed = productItem({ ibuyToken: "new-token", price: 4880 });
    const secondParsed = productItem({ ibuyToken: "new-token-2", price: 4880 });
    const oldProduct = existingProduct({ ibuyToken: "old-token" });
    const secondOldProduct = existingProduct({ id: "old-product-2", ibuyToken: "old-token-2" });

    expect(findCoolpcContinuityMatches([parsed, secondParsed], [oldProduct]).size).toBe(0);
    expect(findCoolpcContinuityMatches([parsed], [oldProduct, secondOldProduct]).size).toBe(0);
  });
});

function existingProduct({
  id = "old-product",
  sourceCategoryId = "category-4",
  ibuyToken,
  name = "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G",
  primaryImageUrl = "https://www.coolpc.com.tw/eval/4/amd7500f.jpg",
  price = 4880,
}: {
  id?: string;
  sourceCategoryId?: string;
  ibuyToken: string;
  name?: string;
  primaryImageUrl?: string | null;
  price?: number;
}) {
  return {
    id,
    sourceCategoryId,
    ibuyToken,
    name,
    primaryImageUrl,
    currentPrice: {
      priceSnapshot: { price, currency: "TWD" as const },
    },
  };
}
