// 驗證 CoolPC filter sync 僅執行本地 matcher，並對外部結構與工作量 fail closed。

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "iconv-lite";
import { afterEach, describe, expect, it } from "vitest";
import { isFilterSyncDue, refreshCoolpcFilterSync } from "../../src/coolpc/filter-sync";
import {
  COOLPC_FILTER_SYNC_SOURCE_LIMITS,
  normalizeFilterSyncProductName,
  parseCoolpcFilterSnapshot,
} from "../../src/coolpc/filter-sync/parser";
import { readCoolpcFilterSyncState } from "../../src/coolpc/filter-sync/state";

const FIXTURE_PATH = join(__dirname, "fixtures", "evaluate-filters.sample.html");
const CPU_AM5_CONDITION = '<input type="checkbox" name="cpuT" alt="1">AM5';
const PSU_PRODUCT = "測試 850W ATX 3.1 銅牌電源, $3999";

const EXPECTED_TAGS_BY_IGRP = {
  "4": {
    "amd ryzen 測試處理器": ["socket:am5"],
  },
  "5": {
    "測試 b850 主機板 m-atx": ["socket:am5", "form_factor:m-atx"],
  },
  "6": {
    "測試桌上型 ddr5 記憶體": ["module_type:desktop", "memory_type:ddr5"],
  },
  "7": {
    "測試 m.2 pcie 4.0 ssd": ["form_factor:m2", "pcie_generation:gen4"],
  },
  "8": {
    "測試 nas 3.5吋 hdd": ["form_factor:3-5-inch", "storage_usage:nas"],
  },
  "9": {
    "測試外接 ssd type-c": ["external_type:external-ssd", "connector:type-c"],
  },
  "12": {
    "amd radeon 測試顯示卡": ["gpu_chip:amd"],
  },
  "14": {
    "測試 e-atx 背插機殼 含電源": [
      "motherboard_support:e-atx",
      "motherboard_support:atx",
      "back_connect:yes",
      "included_psu:yes",
    ],
  },
  "15": {
    "測試 850w atx 3.1 銅牌電源": [
      "wattage_range:800-999",
      "efficiency:bronze",
      "psu_standard:atx-3",
    ],
  },
};

describe("CoolPC filter sync source safety", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  it("keeps the saved fixture aggregate and tag output unchanged", async () => {
    const snapshot = parseCoolpcFilterSnapshot(await readFile(FIXTURE_PATH, "utf8"));

    expect(snapshot).toEqual({
      tagsByIgrp: EXPECTED_TAGS_BY_IGRP,
      conditionCount: 63,
      productCount: 9,
      taggedProductCount: 9,
      ambiguousProductCount: 0,
      sourceValueDriftCount: 0,
    });
  });

  it.each([
    "(a+)+$",
    "[",
    "(AMD)\\1",
    "(?=AMD)AMD",
    "(?<=AMD)AMD",
  ])("treats upstream checkbox value %s as data instead of executable regex", async (rawValue) => {
    const html = await readFile(FIXTURE_PATH, "utf8");
    const baseline = parseCoolpcFilterSnapshot(html);
    const snapshot = parseCoolpcFilterSnapshot(withCpuAm5Value(html, rawValue));

    expect(snapshot.tagsByIgrp).toEqual(baseline.tagsByIgrp);
    expect(snapshot.conditionCount).toBe(baseline.conditionCount);
    expect(snapshot.productCount).toBe(baseline.productCount);
    expect(snapshot.taggedProductCount).toBe(baseline.taggedProductCount);
    expect(snapshot.ambiguousProductCount).toBe(baseline.ambiguousProductCount);
    expect(snapshot.sourceValueDriftCount).toBe(1);
  });

  it.each([
    { watts: "350", expectedTag: "wattage_range:under-400" },
    { watts: "400", expectedTag: "wattage_range:400-599" },
    { watts: "599", expectedTag: "wattage_range:400-599" },
    { watts: "600", expectedTag: "wattage_range:600-799" },
    { watts: "799", expectedTag: "wattage_range:600-799" },
    { watts: "800", expectedTag: "wattage_range:800-999" },
    { watts: "999", expectedTag: "wattage_range:800-999" },
    { watts: "1000", expectedTag: "wattage_range:1000-plus" },
  ])("matches $watts W with the finite local wattage descriptor", async ({
    watts,
    expectedTag,
  }) => {
    const html = (await readFile(FIXTURE_PATH, "utf8")).replace(
      PSU_PRODUCT,
      `測試 ${watts}W ATX 3.1 銅牌電源, $3999`,
    );
    const productName = normalizeFilterSyncProductName(`測試 ${watts}W ATX 3.1 銅牌電源`);

    expect(parseCoolpcFilterSnapshot(html).tagsByIgrp["15"]?.[productName]).toEqual([
      expectedTag,
      "efficiency:bronze",
      "psu_standard:atx-3",
    ]);
  });

  it("handles maximum-length adversarial option text with bounded local matchers", async () => {
    const optionSuffix = "W ATX 3 銅牌電源, $3999";
    const prefix = "9".repeat(
      COOLPC_FILTER_SYNC_SOURCE_LIMITS.optionTextCharacters - optionSuffix.length,
    );
    const product = `${prefix}W ATX 3 銅牌電源`;
    const html = (await readFile(FIXTURE_PATH, "utf8")).replace(
      PSU_PRODUCT,
      `${prefix}${optionSuffix}`,
    );

    expect(
      parseCoolpcFilterSnapshot(html).tagsByIgrp["15"]?.[normalizeFilterSyncProductName(product)],
    ).toEqual(["wattage_range:1000-plus", "efficiency:bronze", "psu_standard:atx-3"]);
  });

  it("rejects missing, duplicate, unterminated, and retargeted managed conditions", async () => {
    const html = await readFile(FIXTURE_PATH, "utf8");

    expect(() =>
      parseCoolpcFilterSnapshot(html.replace('<input type="checkbox" name="cpuT">1700', "")),
    ).toThrow("CoolPC filter conditions changed for cpuT");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(
          CPU_AM5_CONDITION,
          '<input type="checkbox" name="cpuT">AM5<input type="checkbox" name="cpuT" alt="1">AM5',
        ),
      ),
    ).toThrow("CoolPC filter source has duplicate conditions for cpuT");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(CPU_AM5_CONDITION, '<input type="checkbox" name="cpuT">AM5'),
      ),
    ).toThrow("CoolPC filter source has an unterminated condition group for cpuT");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(CPU_AM5_CONDITION, '<input type="checkbox" name="cpuT" alt="2">AM5'),
      ),
    ).toThrow("CoolPC filter target changed for cpuT");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(CPU_AM5_CONDITION, '<input type="checkbox" name="cpuT" alt="unexpected">AM5'),
      ),
    ).toThrow("CoolPC filter source has an unsupported group boundary for cpuT");
  });

  it("rejects excessive condition and option counts before nested matching", async () => {
    const html = await readFile(FIXTURE_PATH, "utf8");
    const extraConditions = Array.from(
      { length: COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionsPerControl },
      (_, index) => `<input type="checkbox" name="cpuT">extra-${index}`,
    ).join("");
    const extraOptions = Array.from(
      { length: COOLPC_FILTER_SYNC_SOURCE_LIMITS.optionsPerSection },
      (_, index) => `<option value="extra-${index}">extra-${index}, $1</option>`,
    ).join("");

    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(CPU_AM5_CONDITION, `${extraConditions}${CPU_AM5_CONDITION}`),
      ),
    ).toThrow("CoolPC filter source has too many conditions for cpuT");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace("</optgroup></select>", `${extraOptions}</optgroup></select>`),
      ),
    ).toThrow("CoolPC filter source has too many options in n4");
  });

  it("rejects oversized HTML and source-controlled fields with bounded errors", async () => {
    const html = await readFile(FIXTURE_PATH, "utf8");
    const oversizedLabel = "L".repeat(
      COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionLabelCharacters + 1,
    );
    const oversizedValue = "V".repeat(
      COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionValueCharacters + 1,
    );
    const oversizedOptionText = "O".repeat(
      COOLPC_FILTER_SYNC_SOURCE_LIMITS.optionTextCharacters + 1,
    );
    const oversizedOptgroupLabel = "G".repeat(
      COOLPC_FILTER_SYNC_SOURCE_LIMITS.optgroupLabelCharacters + 1,
    );

    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace(
          CPU_AM5_CONDITION,
          `<input type="checkbox" name="cpuT" alt="1">${oversizedLabel}`,
        ),
      ),
    ).toThrow("CoolPC filter condition label is too long for cpuT");
    expect(() => parseCoolpcFilterSnapshot(withCpuAm5Value(html, oversizedValue))).toThrow(
      "CoolPC filter condition value is too long for cpuT",
    );
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace("AMD Ryzen 測試處理器, $9999", `${oversizedOptionText}, $9999`),
      ),
    ).toThrow("CoolPC filter option text is too long in n4");
    expect(() =>
      parseCoolpcFilterSnapshot(
        html.replace('label="AMD AM5 9000系列"', `label="${oversizedOptgroupLabel}"`),
      ),
    ).toThrow("CoolPC filter optgroup label is too long in n4");
    expect(() =>
      parseCoolpcFilterSnapshot(`${html}${" ".repeat(COOLPC_FILTER_SYNC_SOURCE_LIMITS.htmlBytes)}`),
    ).toThrow("CoolPC filter source exceeds the HTML size limit");
  });

  it("preserves known-good tags and bounded retry state after rejected source input", async () => {
    const root = await mkdtemp(join(tmpdir(), "partsradar-filter-sync-security-"));
    tempRoots.push(root);
    const stateFilePath = join(root, "state.json");
    const html = await readFile(FIXTURE_PATH, "utf8");
    const first = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 3_600,
      timeoutMs: 5_000,
      userAgent: "test",
      now: new Date("2026-07-30T01:00:00.000Z"),
      fetchImpl: (async () => createHtmlResponse(html)) as typeof fetch,
    });
    const drifted = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 3_600,
      timeoutMs: 5_000,
      userAgent: "test",
      now: new Date("2026-07-30T02:00:00.000Z"),
      fetchImpl: (async () => createHtmlResponse(withCpuAm5Value(html, "["))) as typeof fetch,
    });
    const rejected = await refreshCoolpcFilterSync({
      stateFilePath,
      intervalSeconds: 3_600,
      timeoutMs: 5_000,
      userAgent: "test",
      now: new Date("2026-07-30T03:00:00.000Z"),
      fetchImpl: (async () =>
        createHtmlResponse(
          withCpuAm5Value(
            html,
            "V".repeat(COOLPC_FILTER_SYNC_SOURCE_LIMITS.conditionValueCharacters + 1),
          ),
        )) as typeof fetch,
    });

    expect(first.outcome).toBe("published");
    expect(drifted.outcome).toBe("published");
    expect(drifted.state?.sourceHash).toBe(first.state?.sourceHash);
    expect(drifted.state?.tagsByIgrp).toEqual(first.state?.tagsByIgrp);
    expect(drifted.state?.sourceValueDriftCount).toBe(1);
    expect(rejected.outcome).toBe("failed");
    expect(rejected.state?.sourceHash).toBe(drifted.state?.sourceHash);
    expect(rejected.state?.tagsByIgrp).toEqual(drifted.state?.tagsByIgrp);
    expect(rejected.state?.sourceValueDriftCount).toBe(1);
    expect(rejected.state?.lastError).toBe("CoolPC filter condition value is too long for cpuT.");
    expect(await readCoolpcFilterSyncState(stateFilePath)).toEqual(rejected.state);
    expect(isFilterSyncDue(rejected.state, new Date("2026-07-30T03:30:00.000Z"), 3_600)).toBe(
      false,
    );
    expect(isFilterSyncDue(rejected.state, new Date("2026-07-30T04:00:01.000Z"), 3_600)).toBe(true);
  });
});

function withCpuAm5Value(html: string, rawValue: string): string {
  return html.replace(
    CPU_AM5_CONDITION,
    `<input type="checkbox" name="cpuT" value="${rawValue}" alt="1">AM5`,
  );
}

function createHtmlResponse(html: string): Response {
  return new Response(encode(html, "big5"), {
    status: 200,
    headers: { "content-type": "text/html; charset=big5" },
  });
}
