import { describe, expect, it } from "vitest";
import {
  assessProductFilterQuality,
  auditProductFilterQuality,
  type ProductFilterQualityCandidate,
} from "../../../../src/scripts/ops/production-smoke/checks/product-filter-quality";

describe("product filter quality audit", () => {
  it("covers supported motherboards with their canonical socket", () => {
    const audit = auditProductFilterQuality([
      product("mainstream", 5, [
        "socket:am5",
        "chipset:b850",
        "memory_type:ddr5",
        "form_factor:atx",
      ]),
    ]);

    expect(audit.coverage["5:socket"]).toBe(1);
    expect(audit.belowMinimum).toEqual([]);
  });

  it("still fails socket coverage when an applicable motherboard is missing its socket", () => {
    const audit = auditProductFilterQuality([
      product("covered", 5, ["socket:am5", "chipset:b850", "memory_type:ddr5", "form_factor:atx"]),
      product("missing", 5, ["chipset:b850", "memory_type:ddr5", "form_factor:atx"]),
    ]);

    expect(audit.coverage["5:socket"]).toBe(0.5);
    expect(audit.belowMinimum).toContain("coverage=5:socket:1/2<99.0%");
  });

  it("excludes chipsets outside the supported socket taxonomy from that denominator", () => {
    const audit = auditProductFilterQuality([
      product("mainstream", 5, [
        "socket:lga1851",
        "chipset:w880",
        "memory_type:ddr5",
        "form_factor:atx",
      ]),
      product("workstation", 5, ["chipset:w790", "memory_type:ddr5", "form_factor:eeb"]),
    ]);

    expect(audit.coverage["5:socket"]).toBe(1);
    expect(audit.belowMinimum).toEqual([]);
  });

  it("uses graphics cards, not accessories, as the GPU detail denominator", () => {
    const audit = auditProductFilterQuality([
      product("card", 12, [
        "gpu_product_type:graphics-card",
        "gpu_chip:nvidia",
        "gpu_series:rtx-50",
        "vram_gb:8",
      ]),
      product("holder", 12, ["gpu_product_type:accessory"]),
    ]);

    expect(audit.coverage["12:vram_gb"]).toBe(1);
    expect(audit.belowMinimum).toEqual([]);
    expect(audit.conflicts).toEqual([]);
  });

  it("reports unsupported tags and mutually exclusive values", () => {
    const audit = auditProductFilterQuality([
      product("ram", 6, [
        "module_type:desktop",
        "memory_type:ddr4",
        "memory_type:ddr5",
        "capacity_gb:16",
        "speed_mhz:3200",
        "unknown:value",
      ]),
    ]);

    expect(audit.unsupportedTags).toContain("unsupported=ram:unknown:value");
    expect(audit.conflicts).toContain("conflict=ram:memory_type");
  });

  it("reports required coverage and options with no active products", () => {
    const audit = auditProductFilterQuality([product("hdd", 8, ["capacity_gb:2000"])]);

    expect(audit.belowMinimum).toContain("coverage=8:storage_usage:0/1<98.0%");
    expect(audit.zeroCountOptions).toContain("zero=8:storage_usage:nas");
  });

  it.each([
    ["allows one unclassified product in 1000", 1, 1000, "OK"],
    ["allows nine unclassified products in 1000", 9, 1000, "OK"],
    ["warns for ten unclassified products in 1000", 10, 1000, "WARN"],
    ["allows ten unclassified products in 10000", 10, 10000, "OK"],
    ["warns for twenty unclassified products in 3000", 20, 3000, "WARN"],
  ])("%s", (_label, emptyCount, totalCount, expectedStatus) => {
    const audit = auditProductFilterQuality(caseProducts(totalCount, emptyCount));
    const result = assessProductFilterQuality(audit, [], defaultEmptyThreshold);

    expect(result.status).toBe(expectedStatus);
  });

  it("warns when required coverage is low even below the empty threshold", () => {
    const audit = auditProductFilterQuality(caseProducts(100, 2));

    expect(assessProductFilterQuality(audit, [], defaultEmptyThreshold).status).toBe("WARN");
    expect(audit.belowMinimum).toContain("coverage=14:motherboard_support:98/100<99.0%");
  });

  it("fails for an unsupported tag", () => {
    const audit = auditProductFilterQuality([
      product("cpu", 4, [
        "socket:am5",
        "cpu_family:ryzen-7",
        "integrated_graphics:yes",
        "unknown:value",
      ]),
    ]);

    expect(assessProductFilterQuality(audit, [], defaultEmptyThreshold).status).toBe("FAIL");
  });

  it("fails for conflicting tags", () => {
    const audit = auditProductFilterQuality([
      product("cpu", 4, [
        "socket:am5",
        "socket:lga1700",
        "cpu_family:ryzen-7",
        "integrated_graphics:yes",
      ]),
    ]);

    expect(assessProductFilterQuality(audit, [], defaultEmptyThreshold).status).toBe("FAIL");
  });

  it("keeps zero-count options informational when every quality gate passes", () => {
    const audit = auditProductFilterQuality(caseProducts(100, 0));
    const result = assessProductFilterQuality(audit, [], defaultEmptyThreshold);

    expect(audit.zeroCountOptions.length).toBeGreaterThan(0);
    expect(result.status).toBe("OK");
  });

  it("reports the empty count, ratio, thresholds, and unclassified samples", () => {
    const audit = auditProductFilterQuality(caseProducts(3159, 7));
    const result = assessProductFilterQuality(audit, [], defaultEmptyThreshold);

    expect(result.status).toBe("OK");
    expect(result.message).toContain("empty=7 (0.22%, warn at >=10 and >=0.50%)");
    expect(result.message).toContain("all required coverage gates passed");
    expect(result.message).toContain("unclassified sample(s): case-1");
  });

  it("identifies an exceeded empty threshold in the warning message", () => {
    const audit = auditProductFilterQuality(caseProducts(3200, 18));
    const result = assessProductFilterQuality(audit, [], defaultEmptyThreshold);

    expect(result.status).toBe("WARN");
    expect(result.message).toContain("empty threshold exceeded: 18/3200 (0.56%)");
  });
});

const defaultEmptyThreshold = {
  filterEmptyWarnMinCount: 10,
  filterEmptyWarnRatio: 0.005,
};

function caseProducts(totalCount: number, emptyCount: number): ProductFilterQualityCandidate[] {
  return Array.from({ length: totalCount }, (_, index) =>
    product(`case-${index + 1}`, 14, index < emptyCount ? [] : ["motherboard_support:atx"]),
  );
}

function product(id: string, igrp: number, filterTags: string[]): ProductFilterQualityCandidate {
  return {
    id,
    filterTags,
    sourceCategory: { igrp, displayName: `IGrp ${igrp}` },
  };
}
