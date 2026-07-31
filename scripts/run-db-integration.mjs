// scripts/run-db-integration.mjs
// 執行 PostgreSQL integration tests，並將 0 cases、skip、todo 或失敗視為 gate failure。

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTestDatabaseEnvironment } from "./test-database-safety.mjs";

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["TEST_DATABASE_URL"] });

const reportDir = mkdtempSync(join(tmpdir(), "partsradar-db-integration-"));
const reportPath = join(reportDir, "vitest.json");
const vitestCliPath = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");

try {
  const result = spawnSync(
    process.execPath,
    [
      vitestCliPath,
      "run",
      "--config",
      "vitest.db.config.ts",
      "--reporter=json",
      `--outputFile=${reportPath}`,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;

  if (result.status !== 0) {
    const failureMessages = new Set();

    for (const testResult of report?.testResults ?? []) {
      const candidates = [
        testResult.message,
        ...(testResult.assertionResults ?? [])
          .filter((assertionResult) => assertionResult.status === "failed")
          .flatMap((assertionResult) => assertionResult.failureMessages ?? []),
      ];

      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }

        const message = candidate
          .trim()
          .replace(/\bpostgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database URL]");

        if (message) {
          failureMessages.add(message);
        }
      }
    }

    for (const message of failureMessages) {
      process.stderr.write(`${message}\n`);
    }

    process.exitCode = result.status ?? 1;
  } else {
    if (!report) {
      throw new Error("PostgreSQL integration reporter did not produce a JSON result.");
    }
    const total = Number(report.numTotalTests ?? 0);
    const passed = Number(report.numPassedTests ?? 0);
    const failed = Number(report.numFailedTests ?? 0);
    const skipped = Number(report.numPendingTests ?? 0);
    const todo = Number(report.numTodoTests ?? 0);

    if (total < 1 || failed > 0 || skipped > 0 || todo > 0 || passed !== total) {
      throw new Error(
        `PostgreSQL integration gate rejected total=${total}, passed=${passed}, failed=${failed}, skipped=${skipped}, todo=${todo}.`,
      );
    }

    console.log(`PostgreSQL integration gate passed: ${passed} tests, 0 skipped.`);
  }
} finally {
  rmSync(reportDir, { recursive: true, force: true });
}
