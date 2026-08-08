// scripts/run-mocked-e2e.mjs
// 以隔離 SSR fixture 執行 mocked/state browser suite，並保證結束後清除資料。

import { spawn } from "node:child_process";
import { validateTestDatabaseEnvironment } from "./test-database-safety.mjs";

validateTestDatabaseEnvironment(process.env, { requiredUrls: ["DATABASE_URL"] });

const env = {
  ...process.env,
  PARTSRADAR_SKIP_DOTENV: "1",
};
const forwardedArgs = process.argv.slice(2);
const playwrightArgs = forwardedArgs[0] === "--" ? forwardedArgs.slice(1) : forwardedArgs;

let exitCode = 1;

try {
  await run(
    "packages/db/node_modules/.bin/tsx",
    ["scripts/e2e-visual-ssr-fixture.ts", "seed"],
    env,
  );
  exitCode = await run(
    "node_modules/.bin/playwright",
    ["test", "--grep-invert", "@db-smoke", ...playwrightArgs],
    env,
    false,
  );
} finally {
  await run(
    "packages/db/node_modules/.bin/tsx",
    ["scripts/e2e-visual-ssr-fixture.ts", "cleanup"],
    env,
  );
}

process.exitCode = exitCode;

function run(command, args, childEnv, rejectOnFailure = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: childEnv, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const childExitCode = code ?? 1;
      if (rejectOnFailure && childExitCode !== 0) {
        reject(new Error(`${command} failed with ${signal ?? `exit code ${childExitCode}`}.`));
        return;
      }
      resolve(childExitCode);
    });
  });
}
