// apps/crawler/src/scripts/ops/discord-bot/scheduler-status.ts
// 保存 Discord bot 單一程序內的排程執行摘要，供管理員 /status 唯讀查詢。

export type ScheduleExecutionOutcome = "OK" | "ERROR" | "NOT_RUN";
export type ScheduleExecutionErrorKind = "SCAN_ERROR" | "CHILD_SCHEDULE_ERROR";

export interface ScheduleExecutionState {
  readonly lastStartedAt: Date | null;
  readonly lastCompletedAt: Date | null;
  readonly lastDurationMs: number | null;
  readonly lastOutcome: ScheduleExecutionOutcome;
  readonly nextRunAt: Date | null;
  readonly lastErrorKind: ScheduleExecutionErrorKind | null;
}

export interface TargetPriceScheduleState extends ScheduleExecutionState {
  readonly scannedCount: number;
  readonly dueCount: number;
  readonly processedCount: number;
  readonly sentCount: number;
  readonly rateLimitedCount: number;
  readonly failedCount: number;
}

export interface PersonalReportScheduleState extends ScheduleExecutionState {
  readonly processedCount: number;
  readonly sentCount: number;
  readonly rateLimitedCount: number;
  readonly failedCount: number;
}

export interface PublicReportScheduleState extends ScheduleExecutionState {
  readonly settingCount: number;
  readonly processedCount: number;
  readonly sentCount: number;
  readonly skippedCount: number;
  readonly rateLimitedCount: number;
  readonly failedCount: number;
}

export interface DiscordBotSchedulerStatusSnapshot {
  readonly notificationLoop: ScheduleExecutionState;
  readonly targetPrice: TargetPriceScheduleState;
  readonly personalReports: PersonalReportScheduleState;
  readonly publicReports: PublicReportScheduleState;
}

interface ExecutionUpdate {
  startedAt: Date;
  completedAt: Date;
  outcome: Exclude<ScheduleExecutionOutcome, "NOT_RUN">;
  nextRunAt?: Date | null;
  errorKind?: ScheduleExecutionErrorKind | null;
}

export interface DiscordBotSchedulerStatusReader {
  getSnapshot(): DiscordBotSchedulerStatusSnapshot;
}

export interface DiscordBotSchedulerStatusStore extends DiscordBotSchedulerStatusReader {
  recordNotificationLoop(update: ExecutionUpdate): void;
  recordTargetPrice(
    update: ExecutionUpdate &
      Pick<
        TargetPriceScheduleState,
        | "scannedCount"
        | "dueCount"
        | "processedCount"
        | "sentCount"
        | "rateLimitedCount"
        | "failedCount"
      >,
  ): void;
  recordPersonalReports(
    update: ExecutionUpdate &
      Pick<
        PersonalReportScheduleState,
        "processedCount" | "sentCount" | "rateLimitedCount" | "failedCount"
      >,
  ): void;
  recordPublicReports(
    update: ExecutionUpdate &
      Pick<
        PublicReportScheduleState,
        | "settingCount"
        | "processedCount"
        | "sentCount"
        | "skippedCount"
        | "rateLimitedCount"
        | "failedCount"
      >,
  ): void;
}

export function createDiscordBotSchedulerStatusStore(): DiscordBotSchedulerStatusStore {
  let snapshot = createEmptyDiscordBotSchedulerStatusSnapshot();

  return {
    getSnapshot: () => cloneSnapshot(snapshot),
    recordNotificationLoop(update) {
      snapshot = {
        ...snapshot,
        notificationLoop: executionState(update),
      };
    },
    recordTargetPrice(update) {
      snapshot = {
        ...snapshot,
        targetPrice: {
          ...executionState(update),
          scannedCount: update.scannedCount,
          dueCount: update.dueCount,
          processedCount: update.processedCount,
          sentCount: update.sentCount,
          rateLimitedCount: update.rateLimitedCount,
          failedCount: update.failedCount,
        },
      };
    },
    recordPersonalReports(update) {
      snapshot = {
        ...snapshot,
        personalReports: {
          ...executionState(update),
          processedCount: update.processedCount,
          sentCount: update.sentCount,
          rateLimitedCount: update.rateLimitedCount,
          failedCount: update.failedCount,
        },
      };
    },
    recordPublicReports(update) {
      snapshot = {
        ...snapshot,
        publicReports: {
          ...executionState(update),
          settingCount: update.settingCount,
          processedCount: update.processedCount,
          sentCount: update.sentCount,
          skippedCount: update.skippedCount,
          rateLimitedCount: update.rateLimitedCount,
          failedCount: update.failedCount,
        },
      };
    },
  };
}

export function createEmptyDiscordBotSchedulerStatusSnapshot(): DiscordBotSchedulerStatusSnapshot {
  const emptyExecution = (): ScheduleExecutionState => ({
    lastStartedAt: null,
    lastCompletedAt: null,
    lastDurationMs: null,
    lastOutcome: "NOT_RUN",
    nextRunAt: null,
    lastErrorKind: null,
  });

  return {
    notificationLoop: emptyExecution(),
    targetPrice: {
      ...emptyExecution(),
      scannedCount: 0,
      dueCount: 0,
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    },
    personalReports: {
      ...emptyExecution(),
      processedCount: 0,
      sentCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    },
    publicReports: {
      ...emptyExecution(),
      settingCount: 0,
      processedCount: 0,
      sentCount: 0,
      skippedCount: 0,
      rateLimitedCount: 0,
      failedCount: 0,
    },
  };
}

function executionState(update: ExecutionUpdate): ScheduleExecutionState {
  return {
    lastStartedAt: new Date(update.startedAt),
    lastCompletedAt: new Date(update.completedAt),
    lastDurationMs: Math.max(0, update.completedAt.getTime() - update.startedAt.getTime()),
    lastOutcome: update.outcome,
    nextRunAt: update.nextRunAt ? new Date(update.nextRunAt) : null,
    lastErrorKind: update.errorKind ?? null,
  };
}

function cloneSnapshot(
  snapshot: DiscordBotSchedulerStatusSnapshot,
): DiscordBotSchedulerStatusSnapshot {
  return {
    notificationLoop: cloneExecution(snapshot.notificationLoop),
    targetPrice: { ...snapshot.targetPrice, ...cloneExecution(snapshot.targetPrice) },
    personalReports: {
      ...snapshot.personalReports,
      ...cloneExecution(snapshot.personalReports),
    },
    publicReports: { ...snapshot.publicReports, ...cloneExecution(snapshot.publicReports) },
  };
}

function cloneExecution(state: ScheduleExecutionState): ScheduleExecutionState {
  return {
    ...state,
    lastStartedAt: state.lastStartedAt ? new Date(state.lastStartedAt) : null,
    lastCompletedAt: state.lastCompletedAt ? new Date(state.lastCompletedAt) : null,
    nextRunAt: state.nextRunAt ? new Date(state.nextRunAt) : null,
  };
}
