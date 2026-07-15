import { describe, expect, it } from "vitest";
import {
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
      product("covered", 5, [
        "socket:am5",
        "chipset:b850",
        "memory_type:ddr5",
        "form_factor:atx",
      ]),
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
});

function product(id: string, igrp: number, filterTags: string[]): ProductFilterQualityCandidate {
  return {
    id,
    filterTags,
    sourceCategory: { igrp, displayName: `IGrp ${igrp}` },
  };
}
