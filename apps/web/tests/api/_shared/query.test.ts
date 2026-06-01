import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  InvalidQueryError,
  MAX_PAGE_SIZE,
  getOptionalQueryValue,
  parseEnumQuery,
  parseOptionalIntegerQuery,
  parseOptionalTextQuery,
  parsePaginationQuery,
} from "../../../app/api/_shared/query";

describe("API query helpers", () => {
  it("trims optional values and rejects duplicate parameters", () => {
    expect(getOptionalQueryValue(new URLSearchParams("q=%20RTX%204070%20"), "q")).toBe("RTX 4070");
    expect(getOptionalQueryValue(new URLSearchParams("q=%20%20"), "q")).toBeUndefined();

    expect(() => getOptionalQueryValue(new URLSearchParams("q=cpu&q=gpu"), "q")).toThrow(
      InvalidQueryError,
    );
  });

  it("parses bounded integers", () => {
    const params = new URLSearchParams("igrp=4&minPrice=0&maxPrice=999999");

    expect(parseOptionalIntegerQuery(params, "igrp", { min: 1 })).toBe(4);
    expect(parseOptionalIntegerQuery(params, "minPrice", { min: 0 })).toBe(0);
    expect(parseOptionalIntegerQuery(new URLSearchParams(), "page", { defaultValue: 1 })).toBe(1);
    expect(parseOptionalIntegerQuery(params, "maxPrice", { min: 0, max: 1_000_000 })).toBe(999999);
  });

  it("rejects invalid integer values", () => {
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page=1.5"), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page=1e2"), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page=0x10"), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page=Infinity"), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page=NaN"), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() => parseOptionalIntegerQuery(new URLSearchParams("page="), "page")).toThrow(
      InvalidQueryError,
    );
    expect(() =>
      parseOptionalIntegerQuery(new URLSearchParams("page=0"), "page", { min: 1 }),
    ).toThrow(InvalidQueryError);
    expect(() =>
      parseOptionalIntegerQuery(new URLSearchParams("pageSize=101"), "pageSize", {
        max: MAX_PAGE_SIZE,
      }),
    ).toThrow(InvalidQueryError);
  });

  it("parses text values with a maximum length", () => {
    expect(parseOptionalTextQuery(new URLSearchParams("q=%20CPU%20"), "q", { maxLength: 10 })).toBe(
      "CPU",
    );
    expect(() =>
      parseOptionalTextQuery(new URLSearchParams(`q=${"x".repeat(11)}`), "q", {
        maxLength: 10,
      }),
    ).toThrow(InvalidQueryError);
  });

  it("parses allowlisted enum values", () => {
    const sorts = ["price_asc", "price_desc", "name_asc"] as const;

    expect(parseEnumQuery(new URLSearchParams("sort=price_desc"), "sort", sorts, "price_asc")).toBe(
      "price_desc",
    );
    expect(parseEnumQuery(new URLSearchParams(), "sort", sorts, "price_asc")).toBe("price_asc");
    expect(() =>
      parseEnumQuery(new URLSearchParams("sort=created_at"), "sort", sorts, "price_asc"),
    ).toThrow(InvalidQueryError);
  });

  it("parses pagination defaults and limits", () => {
    expect(parsePaginationQuery(new URLSearchParams())).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(parsePaginationQuery(new URLSearchParams("page=2&pageSize=48"))).toEqual({
      page: 2,
      pageSize: 48,
    });
    expect(() => parsePaginationQuery(new URLSearchParams("pageSize=101"))).toThrow(
      InvalidQueryError,
    );
  });
});
