// apps/web/tests/products/api-hook-states.test.ts
// 以最小 React hook harness 驗證四個 data hooks 的 429 與 abort cleanup。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookHarness = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
  states: [] as Array<{
    initialValue: unknown;
    updates: unknown[];
  }>,
}));

vi.mock("react", () => ({
  useCallback(callback: unknown) {
    return callback;
  },
  useEffect(effect: () => unknown) {
    hookHarness.effects.push(effect);
  },
  useMemo(factory: () => unknown) {
    return factory();
  },
  useRef(initialValue: unknown) {
    return { current: initialValue };
  },
  useState(initialValue: unknown) {
    const state = {
      initialValue,
      updates: [] as unknown[],
    };
    hookHarness.states.push(state);

    return [
      initialValue,
      (nextValue: unknown) => {
        state.updates.push(
          typeof nextValue === "function"
            ? (nextValue as (value: unknown) => unknown)(state.initialValue)
            : nextValue,
        );
      },
    ];
  },
}));

import type { BuildListIntent } from "../../app/build-list/model";
import { useBuildListRefresh } from "../../app/build-list/use-build-list-refresh";
import { useCategories } from "../../app/product-explorer/data/use-categories";
import { useProducts } from "../../app/product-explorer/data/use-products";
import { DEFAULT_QUERY } from "../../app/product-explorer/query-state";
import type { ProductDetailBody } from "../../app/products/[id]/detail/types";
import { usePriceHistoryLoader } from "../../app/products/[id]/detail/use-price-history-loader";
import { useProductDetail } from "../../app/products/[id]/detail/use-product-detail";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

interface HookScenario {
  name: string;
  run: () => void;
  stateIndex: number;
}

const SCENARIOS: HookScenario[] = [
  {
    name: "categories",
    run: () => {
      useCategories();
    },
    stateIndex: 1,
  },
  {
    name: "products",
    run: () => {
      useProducts(true, { ...DEFAULT_QUERY, category: "gpu" });
    },
    stateIndex: 1,
  },
  {
    name: "product detail",
    run: () => {
      useProductDetail(PRODUCT_ID);
    },
    stateIndex: 0,
  },
  {
    name: "price history",
    run: () => {
      usePriceHistoryLoader({
        product: { id: PRODUCT_ID } as ProductDetailBody,
      });
    },
    stateIndex: 0,
  },
];

beforeEach(() => {
  hookHarness.effects.length = 0;
  hookHarness.states.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public API hook states", () => {
  it.each(SCENARIOS)("maps $name 429 responses to rate_limited", async (scenario) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { code: "rate_limited" } }, { status: 429 })),
    );

    scenario.run();
    const cleanup = runEffect(0);
    const stateUpdates = hookHarness.states[scenario.stateIndex].updates;

    expect(stateUpdates).toContain("loading");
    await vi.waitFor(() => expect(stateUpdates).toContain("rate_limited"));
    cleanup?.();
  });

  it.each(SCENARIOS)("ignores $name AbortError after effect cleanup", async (scenario) => {
    const requestSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      if (init?.signal) {
        requestSignals.push(init.signal);
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    scenario.run();
    const cleanup = runEffect(0);
    const stateUpdates = hookHarness.states[scenario.stateIndex].updates;

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(cleanup).toBeTypeOf("function");
    cleanup?.();
    expect(requestSignals).toHaveLength(1);
    expect(requestSignals[0].aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(stateUpdates).toEqual(["loading"]);
  });

  it("loads price history from the loaded product identity", async () => {
    const loadedProductId = "22222222-2222-4222-8222-222222222222";
    const fetchMock = vi.fn(async () =>
      Response.json({
        range: "90d",
        rangeDays: 90,
        points: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    usePriceHistoryLoader({
      product: { id: loadedProductId } as ProductDetailBody,
    });
    const cleanup = runEffect(0);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/products/${loadedProductId}/price-history?days=90`,
      { signal: expect.any(AbortSignal) },
    );
    cleanup?.();
  });

  it("lets the build-list hook recover from 429 through manual refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json(buildListSuccessBody("Current product")));
    vi.stubGlobal("fetch", fetchMock);

    const result = useBuildListRefresh([buildListIntent()], true);
    const cleanup = runEffect(0);
    const stateUpdates = hookHarness.states[1].updates;

    await vi.waitFor(() => expect(stateUpdates).toContain("rate_limited"));
    await result.refresh();
    expect(stateUpdates).toEqual(["loading", "rate_limited", "loading", "ready"]);
    expect(hookHarness.states[0].updates.at(-1)).toMatchObject([{ name: "Current product" }]);
    cleanup?.();
  });

  it("ignores a build-list AbortError after effect cleanup", async () => {
    const requestSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      if (init?.signal) {
        requestSignals.push(init.signal);
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    useBuildListRefresh([buildListIntent()], true);
    const cleanup = runEffect(0);
    const stateUpdates = hookHarness.states[1].updates;

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(cleanup).toBeTypeOf("function");
    cleanup?.();
    expect(requestSignals).toHaveLength(1);
    expect(requestSignals[0].aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(stateUpdates).toEqual(["loading"]);
  });

  it("does not let an older build-list request overwrite a newer success", async () => {
    const olderRequest = deferred<Response>();
    const newerRequest = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockImplementationOnce(() => newerRequest.promise);
    vi.stubGlobal("fetch", fetchMock);

    const result = useBuildListRefresh([buildListIntent()], true);
    const cleanup = runEffect(0);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const newerRefresh = result.refresh();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    newerRequest.resolve(Response.json(buildListSuccessBody("Newer product")));
    await newerRefresh;
    olderRequest.resolve(Response.json(buildListSuccessBody("Older product")));
    await Promise.resolve();
    await Promise.resolve();

    const productUpdates = hookHarness.states[0].updates;
    expect(productUpdates).toContainEqual([expect.objectContaining({ name: "Newer product" })]);
    expect(productUpdates).not.toContainEqual([expect.objectContaining({ name: "Older product" })]);
    cleanup?.();
  });
});

function buildListIntent(): BuildListIntent {
  return {
    productId: PRODUCT_ID,
    quantity: 1,
    includeInExport: true,
    order: 0,
    addedAt: "2026-07-10T08:00:00.000Z",
    updatedAt: "2026-07-10T08:00:00.000Z",
  };
}

function runEffect(index: number): (() => void) | null {
  const cleanup = hookHarness.effects[index]();

  return typeof cleanup === "function" ? (cleanup as () => void) : null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function buildListSuccessBody(name: string) {
  return {
    data: [
      {
        id: PRODUCT_ID,
        name,
        image: null,
        category: {
          displayName: "顯示卡",
        },
        price: {
          amount: 6990,
          currency: "TWD",
        },
        source: {
          url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
        },
        status: {
          isActive: true,
          isExcluded: false,
          exclusionReason: null,
        },
        lastSeenAt: "2026-07-10T08:00:00.000Z",
      },
    ],
    missingProductIds: [],
  };
}
