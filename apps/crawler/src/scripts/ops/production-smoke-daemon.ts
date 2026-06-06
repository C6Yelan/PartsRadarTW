// apps/crawler/src/scripts/ops/production-smoke-daemon.ts
import type { PrismaClient } from "@partsradar/db";
import {
  parseProductionSmokeOptions,
  printProductionSmokeSummary,
  runProductionSmoke,
  type ProductionSmokeOptions,
} from "./production-smoke";
import {
  sendDiscordWebhookMessage,
  type DiscordWebhookSendOptions,
  type DiscordWebhookSendResult,
} from "./discord-webhook";
import {
  createSmokeDiscordNotificationDecision,
  parseSmokeDiscordNotificationOptions,
  readSmokeDiscordNotificationState,
  type SmokeDiscordNotificationOptions,
  writeSmokeDiscordNotificationState,
} from "./smoke-discord-notification";
import {
  getStringArg,
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";

const HELP_FLAG = "--help";
const RUN_ONCE_FLAG = "--run-once";
const DEFAULT_SMOKE_INTERVAL_SECONDS = 300;
const DEFAULT_SMOKE_INITIAL_DELAY_SECONDS = 60;
const MIN_SMOKE_INTERVAL_SECONDS = 60;
const MAX_SMOKE_INTERVAL_SECONDS = 24 * 60 * 60;
const MIN_INITIAL_DELAY_SECONDS = 0;
const MAX_INITIAL_DELAY_SECONDS = 24 * 60 * 60;

export interface ProductionSmokeDaemonOptions extends ProductionSmokeOptions {
  intervalSeconds: number;
  initialDelaySeconds: number;
  runOnce: boolean;
  smokeDiscordNotification: SmokeDiscordNotificationOptions;
}

export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

interface RunProductionSmokeDaemonOptions {
  client: PrismaClient;
  options: ProductionSmokeDaemonOptions;
  shutdown: ShutdownController;
  logMessage?: (message: string) => void;
  sendDiscordWebhook?: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}

export function parseProductionSmokeDaemonOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ProductionSmokeDaemonOptions {
  if (args.includes(HELP_FLAG)) {
    printHelp();
    process.exit(0);
  }

  const smokeOptions = parseProductionSmokeOptions(args, env, cwd);

  return {
    ...smokeOptions,
    intervalSeconds: parseIntegerOption({
      args,
      env,
      argName: "--interval-seconds",
      envName: "SMOKE_INTERVAL_SECONDS",
      fallback: DEFAULT_SMOKE_INTERVAL_SECONDS,
      min: MIN_SMOKE_INTERVAL_SECONDS,
      max: MAX_SMOKE_INTERVAL_SECONDS,
    }),
    initialDelaySeconds: parseIntegerOption({
      args,
      env,
      argName: "--initial-delay-seconds",
      envName: "SMOKE_INITIAL_DELAY_SECONDS",
      fallback: DEFAULT_SMOKE_INITIAL_DELAY_SECONDS,
      min: MIN_INITIAL_DELAY_SECONDS,
      max: MAX_INITIAL_DELAY_SECONDS,
    }),
    runOnce: args.includes(RUN_ONCE_FLAG),
    smokeDiscordNotification: parseSmokeDiscordNotificationOptions(
      args,
      env,
      smokeOptions.workspaceRoot,
    ),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseProductionSmokeDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;

    log(
      `Production smoke daemon started. interval=${options.intervalSeconds}s initialDelay=${options.initialDelaySeconds}s runOnce=${options.runOnce ? "yes" : "no"} baseUrl=${toSafeCliErrorMessage(options.baseUrl)}`,
    );
    await runProductionSmokeDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Production smoke daemon stopped.");
  }
}

export async function runProductionSmokeDaemon({
  client,
  options,
  shutdown,
  logMessage = log,
  sendDiscordWebhook = sendDiscordWebhookMessage,
}: RunProductionSmokeDaemonOptions): Promise<void> {
  if (!options.runOnce && options.initialDelaySeconds > 0) {
    logMessage(`Waiting ${options.initialDelaySeconds}s before first production smoke check.`);
    await shutdown.sleep(options.initialDelaySeconds * 1000);
  }

  do {
    try {
      const summary = await runProductionSmoke(client, options);
      printProductionSmokeSummary(summary);
      await handleSmokeDiscordNotification({
        summary,
        options: options.smokeDiscordNotification,
        logMessage,
        sendDiscordWebhook,
      });
    } catch (error) {
      logMessage(`Production smoke check failed before summary: ${toSafeCliErrorMessage(error)}`);

      if (options.runOnce) {
        throw error;
      }
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }

    const nextRunAt = new Date(Date.now() + options.intervalSeconds * 1000).toISOString();
    logMessage(`Next production smoke check at ${nextRunAt} (${options.intervalSeconds}s).`);
    await shutdown.sleep(options.intervalSeconds * 1000);
  } while (!shutdown.requested);
}

async function handleSmokeDiscordNotification({
  summary,
  options,
  logMessage,
  sendDiscordWebhook,
}: {
  summary: Awaited<ReturnType<typeof runProductionSmoke>>;
  options: SmokeDiscordNotificationOptions;
  logMessage: (message: string) => void;
  sendDiscordWebhook: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}): Promise<void> {
  if (!options.adminWebhookUrl) {
    return;
  }

  let previousState = null;

  try {
    previousState = await readSmokeDiscordNotificationState(options.stateFilePath);
  } catch (error) {
    logMessage(
      `Smoke Discord notification state could not be read; treating as empty state: ${toSafeCliErrorMessage(error)}`,
    );
  }

  const decision = createSmokeDiscordNotificationDecision({
    summary,
    previousState,
    options,
  });

  if (decision.action === "skip") {
    if (decision.nextState) {
      await writeSmokeDiscordNotificationStateSafely({
        path: options.stateFilePath,
        state: decision.nextState,
        logMessage,
      });
    }

    return;
  }

  const result = await sendDiscordWebhook({
    webhookUrl: options.adminWebhookUrl,
    message: decision.message,
  });

  if (result.status === "sent") {
    await writeSmokeDiscordNotificationStateSafely({
      path: options.stateFilePath,
      state: decision.nextState,
      logMessage,
    });
    logMessage(
      `Smoke Discord notification sent. kind=${decision.kind} httpStatus=${result.httpStatus}`,
    );
    return;
  }

  if (result.status === "rate_limited") {
    logMessage(
      `Smoke Discord notification rate limited. retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`,
    );
    return;
  }

  if (result.status === "failed") {
    logMessage(
      `Smoke Discord notification failed. httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(result.message)}`,
    );
    return;
  }

  logMessage(`Smoke Discord notification skipped by sender. reason=${result.reason}`);
}

async function writeSmokeDiscordNotificationStateSafely({
  path,
  state,
  logMessage,
}: {
  path: string;
  state: Awaited<ReturnType<typeof readSmokeDiscordNotificationState>>;
  logMessage: (message: string) => void;
}): Promise<void> {
  if (!state) {
    return;
  }

  try {
    await writeSmokeDiscordNotificationState(path, state);
  } catch (error) {
    logMessage(
      `Smoke Discord notification state could not be written: ${toSafeCliErrorMessage(error)}`,
    );
  }
}

function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;

  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current smoke check.`);
    }

    stopRequested = true;
    wakeSleeper?.();
  };

  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  return {
    get requested() {
      return stopRequested;
    },
    sleep(ms: number) {
      return new Promise((resolve) => {
        if (stopRequested) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeout);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm --filter @partsradar/crawler ops:production-smoke-daemon -- [options]

Options:
  --run-once                         Run one smoke check and exit.
  --interval-seconds <sec>           Delay between smoke checks.
                                     Default: ${DEFAULT_SMOKE_INTERVAL_SECONDS}
  --initial-delay-seconds <sec>      Delay before the first daemon check.
                                     Default: ${DEFAULT_SMOKE_INITIAL_DELAY_SECONDS}
  --smoke-discord-state-file <path>  State file for Discord smoke notification dedupe.
  --smoke-discord-cooldown-seconds <sec>
                                     Delay before repeating unchanged Discord alerts.

The daemon also accepts production smoke options such as --base-url and --timeout-ms.
`);
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
