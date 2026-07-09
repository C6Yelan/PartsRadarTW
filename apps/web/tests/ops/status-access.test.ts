// apps/web/tests/ops/status-access.test.ts
// 驗證待移除的 /ops/status access gate、token 讀取與 Bearer token 解析行為。

import { describe, expect, it } from "vitest";
import {
  extractBearerToken,
  isOpsStatusAccessAllowed,
  readConfiguredOpsStatusToken,
} from "../../app/ops/status/access";

describe("ops status access", () => {
  it("rejects requests when the ops route is disabled", () => {
    expect(
      isOpsStatusAccessAllowed(
        {
          OPS_STATUS_ENABLED: "false",
          OPS_STATUS_TOKEN: "secret-token",
        },
        "secret-token",
      ),
    ).toBe(false);
  });

  it("requires a non-placeholder token", () => {
    expect(
      readConfiguredOpsStatusToken({
        OPS_STATUS_ENABLED: "true",
        OPS_STATUS_TOKEN: "replace_with_random_ops_status_token",
      }),
    ).toBeNull();
    expect(
      isOpsStatusAccessAllowed(
        {
          OPS_STATUS_ENABLED: "true",
          OPS_STATUS_TOKEN: "replace_with_random_ops_status_token",
        },
        "replace_with_random_ops_status_token",
      ),
    ).toBe(false);
  });

  it("accepts an exact matching token", () => {
    expect(
      isOpsStatusAccessAllowed(
        {
          OPS_STATUS_ENABLED: "true",
          OPS_STATUS_TOKEN: "secret-token",
        },
        "secret-token",
      ),
    ).toBe(true);
    expect(
      isOpsStatusAccessAllowed(
        {
          OPS_STATUS_ENABLED: "true",
          OPS_STATUS_TOKEN: "secret-token",
        },
        "wrong-token",
      ),
    ).toBe(false);
  });

  it("extracts bearer tokens for curl-friendly access", () => {
    expect(extractBearerToken("Bearer secret-token")).toBe("secret-token");
    expect(extractBearerToken("bearer secret-token")).toBe("secret-token");
    expect(extractBearerToken("Basic secret-token")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });
});
