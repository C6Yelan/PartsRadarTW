// apps/web/e2e/public-smoke.spec.ts
// 以 Playwright 驗證公開網站主要頁面、配單互動與 public API 的基本可用性。

import { type APIRequestContext, expect, test } from "@playwright/test";

interface ProductListResponse {
  data: Array<{
    id: string;
    image: {
      url: string;
    } | null;
  }>;
}

test.describe("public web smoke", () => {
  test("loads the homepage and build list on desktop and mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PartsRadarTW").first()).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "搜尋商品名稱" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord 通知" })).toBeVisible();
    await expect(page.getByRole("region", { name: "商品列表" })).toBeVisible();

    await page.goto("/build-list");
    await expect(page.getByRole("heading", { exact: true, name: "配單" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Discord 通知" })).toBeVisible();
    await expect(page.getByText("配單目前沒有品項")).toBeVisible();

    await page.goto("/discord");
    await expect(page.getByRole("heading", { exact: true, name: "Discord 通知" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Discord 指令選單截圖" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "快速開始" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "指令說明" })).toBeVisible();
    const commandsSection = page.getByRole("region", { name: "指令說明" });
    await expect(
      commandsSection.getByRole("heading", { exact: true, name: "即時目標價提醒" }),
    ).toBeVisible();
    await expect(
      commandsSection.getByRole("heading", { exact: true, name: "個人價格報告" }),
    ).toBeVisible();
    await expect(
      commandsSection.getByRole("heading", { exact: true, name: "伺服器公開報告" }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: "/watch 即時目標價提醒面板截圖" })).toBeVisible();
    await expect(page.getByRole("img", { name: "個人價格報告設定截圖" })).toBeVisible();
    await expect(page.getByRole("img", { name: "伺服器公開報告管理面板截圖" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "常見問題" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "一般成員能用哪些指令？" })).toBeVisible();
  });

  test("renders and updates a persisted build list item", async ({ page }) => {
    const productId = "11111111-1111-1111-1111-111111111111";

    await page.addInitScript(
      ({ id }) => {
        window.localStorage.setItem(
          "partsradartw:build-list:v1",
          JSON.stringify([
            {
              id,
              name: "測試顯示卡 RTX",
              image: {
                url: `/api/product-images/${id}.webp`,
                alt: "測試顯示卡 RTX",
              },
              category: {
                id: "category-12",
                igrp: 12,
                displayName: "顯示卡",
                sourceName: "顯示卡 VGA",
              },
              price: {
                amount: 6990,
                currency: "TWD",
                capturedAt: "2026-05-28T11:45:00.000Z",
                lastSeenAt: "2026-05-28T11:55:00.000Z",
              },
              source: {
                name: "coolpc",
                url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
              },
              quantity: 2,
              addedAt: "2026-05-28T12:00:00.000Z",
              updatedAt: "2026-05-28T12:00:00.000Z",
            },
          ]),
        );
      },
      { id: productId },
    );

    await page.goto("/build-list");
    const item = page.getByRole("article").filter({ hasText: "測試顯示卡 RTX" });

    await expect(page.getByText("2 件商品")).toBeVisible();
    await expect(item.getByRole("heading", { name: "測試顯示卡 RTX" })).toBeVisible();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("2");
    await expect(item.getByText("NT$ 13,980")).toBeVisible();

    await item.getByRole("button", { name: "增加數量" }).click();
    await expect(page.getByText("3 件商品")).toBeVisible();
    await expect(item.getByRole("spinbutton", { name: "數量" })).toHaveValue("3");
    await expect(item.getByText("NT$ 20,970")).toBeVisible();

    await item.getByRole("button", { name: "移除" }).click();
    await expect(page.getByText("已從配單移除")).toBeVisible();
    await page.getByRole("button", { name: "復原" }).click();
    await expect(page.getByRole("article").filter({ hasText: "測試顯示卡 RTX" })).toBeVisible();
  });
});

test.describe("public API smoke", () => {
  test("checks public data and rate-limit headers", async ({ request }) => {
    const sourceStatus = await request.get("/api/source-status");
    expect(sourceStatus.status()).toBe(200);
    await expectJsonShape(sourceStatus, ["status"]);

    const categories = await request.get("/api/categories");
    expect(categories.status()).toBe(200);
    await expectJsonShape(categories, ["data"]);

    const products = await request.get("/api/products?pageSize=1");
    expect(products.status()).toBe(200);
    expect(products.headers()["x-ratelimit-limit"]).toBeTruthy();
    expect(products.headers()["x-ratelimit-remaining"]).toBeTruthy();
    expect(products.headers()["x-ratelimit-reset"]).toBeTruthy();
    await expectJsonShape(products, ["data", "pagination"]);
  });

  test("checks product detail, price history, and image API when a product exists", async ({
    request,
  }) => {
    const product = await fetchFirstProduct(request);
    if (!product) {
      test.skip(true, "No product exists in this environment.");
      return;
    }

    const detail = await request.get(`/api/products/${product.id}`);
    expect(detail.status()).toBe(200);
    await expectJsonShape(detail, ["id", "name", "price"]);

    const priceHistory = await request.get(`/api/products/${product.id}/price-history?range=90d`);
    expect(priceHistory.status()).toBe(200);
    await expectJsonShape(priceHistory, ["points", "summary"]);

    if (!product.image?.url) {
      test.skip(true, "The first product has no cached image.");
      return;
    }

    const image = await request.get(product.image.url);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/");
  });
});

async function fetchFirstProduct(request: APIRequestContext) {
  const response = await request.get("/api/products?pageSize=1");

  if (!response.ok()) {
    return null;
  }

  const body = (await response.json()) as ProductListResponse;

  return body.data[0] ?? null;
}

async function expectJsonShape(response: { json(): Promise<unknown> }, keys: string[]) {
  const body = await response.json();

  expect(body).toEqual(
    expect.objectContaining(Object.fromEntries(keys.map((key) => [key, expect.anything()]))),
  );
}
