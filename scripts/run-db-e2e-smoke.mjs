// scripts/run-db-e2e-smoke.mjs
// 在隔離 PostgreSQL 上管理 deterministic seed，並保證 smoke 結束後清除資料。

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateTestDatabaseEnvironment } from "./test-database-safety.mjs";

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["DATABASE_URL"] });

const storageDir = await mkdtemp(join(tmpdir(), "partsradar-e2e-images-"));
const env = {
  ...process.env,
  E2E_SKIP_BUILD: "1",
  PARTSRADAR_SKIP_DOTENV: "1",
  PRODUCT_IMAGE_STORAGE_DIR: storageDir,
};

let exitCode = 1;

try {
  await run("packages/db/node_modules/.bin/tsx", ["scripts/e2e-db-fixture.ts", "seed"], env);
  exitCode = await run(
    "node_modules/.bin/playwright",
    ["test", "--project", "chromium-desktop", "--grep", "@db-smoke"],
    env,
    false,
  );
} finally {
  try {
    await run("packages/db/node_modules/.bin/tsx", ["scripts/e2e-db-fixture.ts", "cleanup"], env);
  } finally {
    await rm(storageDir, { force: true, recursive: true });
  }
}

process.exitCode = exitCode;

function run(command, args, childEnv, rejectOnFailure = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: childEnv, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const exitCode = code ?? 1;
      if (rejectOnFailure && exitCode !== 0) {
        reject(new Error(`${command} failed with ${signal ?? `exit code ${exitCode}`}.`));
        return;
      }
      resolve(exitCode);
    });
  });
}
