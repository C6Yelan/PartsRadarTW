// 驗證 ops daemon 共用 shutdown controller 的停止、喚醒與 callback 契約。

import { describe, expect, it, vi } from "vitest";
import { createInterruptibleShutdownController } from "../../../../src/scripts/ops/shared/shutdown";

describe("createInterruptibleShutdownController", () => {
  it("requests stop, wakes an active sleep, and invokes onStop once", async () => {
    const onSignal = vi.fn();
    const onStop = vi.fn();
    const shutdown = createInterruptibleShutdownController({ onSignal });
    shutdown.onStop(onStop);

    const sleep = shutdown.sleep(60_000);
    shutdown.requestStop("SIGTERM");
    shutdown.requestStop("SIGINT");

    await expect(sleep).resolves.toBeUndefined();
    expect(shutdown.requested).toBe(true);
    expect(onSignal).toHaveBeenCalledOnce();
    expect(onSignal).toHaveBeenCalledWith("SIGTERM");
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("resolves sleep immediately after stop is requested", async () => {
    const shutdown = createInterruptibleShutdownController();
    shutdown.requestStop("SIGINT");

    await expect(shutdown.sleep(60_000)).resolves.toBeUndefined();
  });
});
