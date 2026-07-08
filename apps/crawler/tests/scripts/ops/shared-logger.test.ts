// apps/crawler/tests/scripts/ops/shared-logger.test.ts
// 驗證 ops shared logger 的 key-value 格式、level filter 與基本敏感字串遮蔽。

import { describe, expect, it } from "vitest";

import { createOpsLogger, formatOpsLogLine } from "../../../src/scripts/ops/shared/logger";

describe("ops logger", () => {
  it("formats log lines as timestamped key-value output", () => {
    expect(
      formatOpsLogLine(new Date("2026-07-03T01:02:03.004Z"), "info", "cycle finished", {
        status: "OK",
        count: 3,
      }),
    ).toBe('2026-07-03T01:02:03.004Z level=info message="cycle finished" status=OK count=3');
  });

  it("filters by level and redacts common secret fields", () => {
    const lines: string[] = [];
    const logger = createOpsLogger({
      level: "warn",
      now: () => new Date("2026-07-03T01:02:03.004Z"),
      sink: (line) => lines.push(line),
    });

    logger.info("token=abc skipped");
    logger.error("webhookUrl=https://discord.example/token failed");

    expect(lines).toEqual([
      "2026-07-03T01:02:03.004Z level=error message=\"webhookUrl=[redacted] failed\"",
    ]);
  });
});
