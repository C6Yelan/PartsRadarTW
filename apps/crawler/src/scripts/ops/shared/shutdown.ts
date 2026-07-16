// 提供 ops daemon 共用的一次性停止狀態、可中斷 sleep 與停止 callback。

export interface InterruptibleShutdownController {
  readonly requested: boolean;
  requestStop(signal: NodeJS.Signals): void;
  onStop(callback: () => void): void;
  sleep(ms: number): Promise<void>;
}

interface CreateShutdownControllerOptions {
  onSignal?: (signal: NodeJS.Signals) => void;
}

export function createInterruptibleShutdownController({
  onSignal,
}: CreateShutdownControllerOptions = {}): InterruptibleShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;
  const stopCallbacks = new Set<() => void>();

  const handleSigint = () => requestStop("SIGINT");
  const handleSigterm = () => requestStop("SIGTERM");

  function requestStop(signal: NodeJS.Signals): void {
    if (stopRequested) {
      return;
    }

    stopRequested = true;
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    onSignal?.(signal);
    wakeSleeper?.();

    for (const callback of stopCallbacks) {
      callback();
    }
  }

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  return {
    get requested() {
      return stopRequested;
    },
    requestStop,
    onStop(callback) {
      stopCallbacks.add(callback);
    },
    sleep(ms) {
      if (stopRequested) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);

        wakeSleeper = () => {
          clearTimeout(timeoutId);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}
