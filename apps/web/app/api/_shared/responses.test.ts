import { describe, expect, it } from "vitest";

import * as responseExports from "./responses";
import {
  API_ERROR_MESSAGES,
  internalErrorResponse,
  invalidQueryResponse,
  jsonOk,
  notFoundResponse,
} from "./responses";

describe("API response helpers", () => {
  it("does not export the unsafe generic error helper", () => {
    expect("jsonError" in responseExports).toBe(false);
  });

  it("returns successful JSON responses without an extra wrapper", async () => {
    const response = jsonOk({ data: [{ id: "category-1" }] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "category-1" }] });
  });

  it("uses the public invalid query error shape", async () => {
    const response = invalidQueryResponse();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_query",
        message: API_ERROR_MESSAGES.invalidQuery,
      },
    });
  });

  it("keeps not-found and internal errors generic", async () => {
    const notFound = notFoundResponse();
    const internalError = internalErrorResponse();

    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({
      error: {
        code: "not_found",
        message: API_ERROR_MESSAGES.notFound,
      },
    });
    expect(internalError.status).toBe(500);
    expect(await internalError.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});
