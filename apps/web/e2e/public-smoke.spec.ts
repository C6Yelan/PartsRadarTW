// apps/web/e2e/public-smoke.spec.ts
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
    await expect(page.getByRole("img", { name: "指令操作示意圖準備中" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "管理者設定檢查" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "開啟管理面板" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "指令說明" })).toBeVisible();
    await expect(page.getByRole("img", { name: "/watch 管理面板介面圖準備中" })).toBeVisible();
    await expect(page.getByRole("img", { name: "個人價格報告設定介面圖準備中" })).toBeVisible();
    await expect(page.getByRole("img", { name: "公開報告管理面板介面圖準備中" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "常見問題" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "公開報告可以只看特定商品嗎？" })).toBeVisible();
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
