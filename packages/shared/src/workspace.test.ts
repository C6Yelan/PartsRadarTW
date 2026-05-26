import { describe, expect, it } from "vitest";

describe("workspace test setup", () => {
  it("runs TypeScript tests with Vitest", () => {
    const workspacePackages = [
      "@partsradar/web",
      "@partsradar/crawler",
      "@partsradar/shared",
      "@partsradar/db",
    ];

    expect(workspacePackages).toContain("@partsradar/shared");
  });
});
