// packages/db/tests/test-database-safety.test.ts
// 驗證 disposable database URL 規則在任何資料庫程序啟動前 fail closed。

import { describe, expect, it } from "vitest";
import { validateTestDatabaseEnvironment } from "../../../scripts/test-database-safety.mjs";

const ISOLATED = {
  PARTSRADAR_TEST_DATABASE_ISOLATED: "1",
};
const INTEGRATION_URL =
  "postgresql://partsradar_test:test-password@127.0.0.1:55432/partsradar_test";
const E2E_URL = "postgresql://partsradar_e2e:test-password@localhost:5432/partsradar_e2e";

describe("validateTestDatabaseEnvironment", () => {
  it("accepts the integration and E2E test-only identities on loopback hosts", () => {
    expect(
      validateTestDatabaseEnvironment(
        {
          ...ISOLATED,
          DATABASE_URL: INTEGRATION_URL,
          TEST_DATABASE_URL: INTEGRATION_URL,
        },
        { requiredUrls: ["TEST_DATABASE_URL"] },
      ),
    ).toMatchObject({
      DATABASE_URL: {
        database: "partsradar_test",
        host: "127.0.0.1",
        port: "55432",
        username: "partsradar_test",
      },
      TEST_DATABASE_URL: {
        database: "partsradar_test",
        host: "127.0.0.1",
        port: "55432",
        username: "partsradar_test",
      },
    });

    expect(
      validateTestDatabaseEnvironment(
        { ...ISOLATED, DATABASE_URL: E2E_URL },
        { requiredUrls: ["DATABASE_URL"] },
      ),
    ).toMatchObject({
      DATABASE_URL: {
        database: "partsradar_e2e",
        host: "localhost",
        port: "5432",
        username: "partsradar_e2e",
      },
    });
  });

  it.each([
    [
      "remote host",
      {
        ...ISOLATED,
        DATABASE_URL: "postgresql://partsradar_test:do-not-print@example.com:5432/partsradar_test",
      },
    ],
    [
      "production-like identity",
      {
        ...ISOLATED,
        DATABASE_URL: "postgresql://partsradar:do-not-print@127.0.0.1:5432/partsradar",
      },
    ],
    [
      "different database",
      {
        ...ISOLATED,
        DATABASE_URL: INTEGRATION_URL,
        TEST_DATABASE_URL:
          "postgresql://partsradar_e2e:do-not-print@127.0.0.1:55432/partsradar_e2e",
      },
    ],
    [
      "different port",
      {
        ...ISOLATED,
        DATABASE_URL: INTEGRATION_URL,
        TEST_DATABASE_URL:
          "postgresql://partsradar_test:do-not-print@127.0.0.1:55433/partsradar_test",
      },
    ],
  ])("rejects %s without exposing URL credentials", (_label, env) => {
    expect(() => validateTestDatabaseEnvironment(env)).toThrow();

    try {
      validateTestDatabaseEnvironment(env);
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print");
      expect(String(error)).not.toContain("postgresql://");
    }
  });

  it("rejects a missing URL or isolation marker", () => {
    expect(() =>
      validateTestDatabaseEnvironment(ISOLATED, { requiredUrls: ["DATABASE_URL"] }),
    ).toThrow("DATABASE_URL is required");
    expect(() => validateTestDatabaseEnvironment({ DATABASE_URL: INTEGRATION_URL })).toThrow(
      "isolation marker is required",
    );
  });
});
