// apps/crawler/tests/scripts/ops/shared/shared-logger.test.ts
// 驗證 ops shared logger 的 key-value 格式、level filter 與基本敏感字串遮蔽。

import { describe, expect, it } from "vitest";

import { createOpsLogger, formatOpsLogLine } from "../../../../src/scripts/ops/shared/logger";

describe("ops logger", () => {
  it("formats log lines as timestamped key-value output", () => {
    expect(
      formatOpsLogLine(new Date("2026-07-03T01:02:03.004Z"), "info", "cycle finished", {
        status: "OK",
        count: 3,
      }),
    ).toBe('2026-07-03T01:02:03.004Z level=info message="cycle finished" status=OK count=3');
  });

  it("filters by level and sanitizes messages and structured field values", () => {
    const lines: string[] = [];
    const logger = createOpsLogger({
      level: "warn",
      now: () => new Date("2026-07-03T01:02:03.004Z"),
      sink: (line) => lines.push(line),
    });

    logger.info("token=fake-filtered-token skipped");
    logger.error("Authorization: Bearer fake-message-token failed", {
      database: "postgresql://fake-user:fake-password@db.example/app",
      webhook: "https://discord.com/api/webhooks/123/fake-webhook-token",
      product: "RTX 5090",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('message="Authorization: Bearer [redacted] failed"');
    expect(lines[0]).toContain('database="postgresql://[redacted]"');
    expect(lines[0]).toContain('webhook="https://discord.com/api/webhooks/[redacted]"');
    expect(lines[0]).toContain('product="RTX 5090"');
    expect(lines[0]).not.toContain("fake-message-token");
    expect(lines[0]).not.toContain("fake-password");
    expect(lines[0]).not.toContain("fake-webhook-token");
  });
});
