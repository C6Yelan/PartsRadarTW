import { describe, expect, it } from "vitest";

import * as responseExports from "../../../app/api/_shared/responses";
import {
  API_ERROR_MESSAGES,
  internalErrorResponse,
  invalidQueryResponse,
  jsonOk,
  notFoundResponse,
  rateLimitedResponse,
} from "../../../app/api/_shared/responses";

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

  it("returns public-safe rate limit errors with retry headers", async () => {
    const response = rateLimitedResponse({
      limit: 120,
      remaining: 0,
      resetEpochSeconds: 1_779_980_460,
      retryAfterSeconds: 30,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("1779980460");
    expect(await response.json()).toEqual({
      error: {
        code: "rate_limited",
        message: API_ERROR_MESSAGES.rateLimited,
      },
    });
  });
});
