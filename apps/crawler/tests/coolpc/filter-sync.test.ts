// 驗證 CoolPC 篩選來源解析、拒絕 drift、低頻發布與 last-known-good 保留。

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "iconv-lite";
import { afterEach, describe, expect, it } from "vitest";
import { isFilterSyncDue, refreshCoolpcFilterSync } from "../../src/coolpc/filter-sync";
import {
  normalizeFilterSyncProductName,
  parseCoolpcFilterSnapshot,
} from "../../src/coolpc/filter-sync/parser";
import { readCoolpcFilterSyncState } from "../../src/coolpc/filter-sync/state";
import { parseCoolpcCategoryPage } from "../../src/coolpc/parser";
import { context, fixture } from "./parser-support";

const FIXTURE_PATH = join(__dirname, "fixtures", "evaluate-filters.sample.html");

describe("CoolPC filter sync", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it("maps existing source conditions to stable product tags", async () => {
    const snapshot = parseCoolpcFilterSnapshot(await readFile(FIXTURE_PATH, "utf8"));

    expect(snapshot.conditionCount).toBe(63);
    expect(snapshot.taggedProductCount).toBe(snapshot.productCount);
    expect(snapshot.ambiguousProductCount).toBe(0);
    expect(
      snapshot.tagsByIgrp["4"]?.[normalizeFilterSyncProductName("AMD Ryzen 測試處理器")],
    ).toEqual(["socket:am5"]);
    expect(
      snapshot.tagsByIgrp["7"]?.[normalizeFilterSyncProductName("測試 M.2 PCIe 4.0 SSD")],
    ).toEqual(["form_factor:m2", "pcie_generation:gen4"]);
    expect(
      snapshot.tagsByIgrp["8"]?.[normalizeFilterSyncProductName("測試 NAS 3.5吋 HDD")],
    ).toEqual(["form_factor:3-5-inch", "storage_usage:nas"]);
    expect(
      snapshot.tagsByIgrp["9"]?.[normalizeFilterSyncProductName("測試外接 SSD Type-C")],
    ).toEqual(["external_type:external-ssd", "connector:type-c"]);
    expect(
      snapshot.tagsByIgrp["15"]?.[normalizeFilterSyncProductName("測試 850W ATX 3.1 銅牌電源")],
    ).toEqual(["wattage_range:800-999", "efficiency:bronze", "psu_standard:atx-3"]);
  });

  it("rejects unknown conditions inside a managed source group", async () => {
    const html = (await readFile(FIXTURE_PATH, "utf8")).replace(
      '<input type="checkbox" name="cpuT" alt="1">AM5',
      '<input type="checkbox" name="cpuT">AM5<input type="checkbox" name="cpuT" alt="1">AM6',
    );

    expect(() => parseCoolpcFilterSnapshot(html)).toThrow(
      "CoolPC filter conditions changed for cpuT",
    );
  });

  it("rejects a managed source section without priced products", async () => {
    const html = (await readFile(FIXTURE_PATH, "utf8")).replace(
      "AMD Ryzen 測試處理器, $9999",
      "AMD Ryzen 測試處理器",
    );

    expect(() => parseCoolpcFilterSnapshot(html)).toThrow(
      "CoolPC filter source has no priced products in n4",
    );
  });

  it("merges published source tags into the regular category parser output", () => {
    const name = "AMD Ryzen 5 7500F MPK【6核/12緒】3.7G";
    const parsed = parseCoolpcCategoryPage(fixture("cpu-category.normal.html"), {
      ...context,
      sourceFilterTagsByProductName: {
        [normalizeFilterSyncProductName(name)]: ["socket:lga1851", "integrated_graphics:yes"],
      },
    });

    expect(parsed.items[0]?.filterTags).toEqual([
      "socket:lga1851",
      "cpu_family:ryzen-5",
      "integrated_graphics:yes",
    ]);
  });

  it("publishes valid Big5 source data and skips until the interval is due", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-filter-sync-"));
    tempRoots.push(root);
    const stateFilePath = join(root, "state.json");
    const html = await readFile(FIXTURE_PATH, "utf8");
    const now = new Date("2026-07-13T04:00:00.000Z");
    const fetchImpl = async () => new Response(encode(html, "big5"), { status: 200 });

    const published = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 604800,
      timeoutMs: 5000,
      userAgent: "test",
      now,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(published.outcome).toBe("published");
    expect(published.state?.lastError).toBeNull();
    expect(await readCoolpcFilterSyncState(stateFilePath)).toEqual(published.state);
    expect(isFilterSyncDue(published.state, new Date("2026-07-14T04:00:00.000Z"), 604800)).toBe(
      false,
    );

    const skipped = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 604800,
      timeoutMs: 5000,
      userAgent: "test",
      now: new Date("2026-07-14T04:00:00.000Z"),
      fetchImpl: async () => {
        throw new Error("should not fetch before due");
      },
    });
    expect(skipped.outcome).toBe("skipped");
  });

  it("keeps last-known-good tags when a later source refresh fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-filter-sync-"));
    tempRoots.push(root);
    const stateFilePath = join(root, "state.json");
    const html = await readFile(FIXTURE_PATH, "utf8");
    const first = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 3600,
      timeoutMs: 5000,
      userAgent: "test",
      now: new Date("2026-07-13T04:00:00.000Z"),
      fetchImpl: (async () => new Response(encode(html, "big5"), { status: 200 })) as typeof fetch,
    });
    const failed = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 3600,
      timeoutMs: 5000,
      userAgent: "test",
      now: new Date("2026-07-13T05:00:00.000Z"),
      fetchImpl: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
    });

    expect(failed.outcome).toBe("failed");
    expect(failed.state?.sourceHash).toBe(first.state?.sourceHash);
    expect(failed.state?.tagsByIgrp).toEqual(first.state?.tagsByIgrp);
    expect(failed.state?.lastError).toContain("HTTP 503");
  });
});
