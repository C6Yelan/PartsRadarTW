// apps/web/tests/announcements/data.test.ts
// 驗證首頁公告只選擇已發布、尚未過期且 pinned 的最新項目。

import { describe, expect, it } from "vitest";

import {
  findActivePinnedAnnouncement,
  listPublishedAnnouncements,
  type PublicAnnouncement,
} from "../../app/announcements/data";

const BASE_ANNOUNCEMENT: PublicAnnouncement = {
  id: "base",
  title: "Base",
  summary: "Summary",
  body: ["Body"],
  severity: "info",
  publishedAt: "2026-07-01T00:00:00.000Z",
  pinned: true,
};

describe("public announcement selection", () => {
  it("selects the newest active pinned announcement", () => {
    const announcements: PublicAnnouncement[] = [
      BASE_ANNOUNCEMENT,
      {
        ...BASE_ANNOUNCEMENT,
        id: "newer",
        publishedAt: "2026-07-10T00:00:00.000Z",
      },
      {
        ...BASE_ANNOUNCEMENT,
        id: "not-pinned",
        publishedAt: "2026-07-11T00:00:00.000Z",
        pinned: false,
      },
    ];

    expect(
      findActivePinnedAnnouncement(
        announcements,
        new Date("2026-07-12T00:00:00.000Z"),
      )?.id,
    ).toBe("newer");
  });

  it("excludes future, expired and invalid announcements", () => {
    const announcements: PublicAnnouncement[] = [
      {
        ...BASE_ANNOUNCEMENT,
        id: "expired",
        expiresAt: "2026-07-05T00:00:00.000Z",
      },
      {
        ...BASE_ANNOUNCEMENT,
        id: "future",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        ...BASE_ANNOUNCEMENT,
        id: "invalid",
        publishedAt: "not-a-date",
      },
    ];

    expect(
      findActivePinnedAnnouncement(
        announcements,
        new Date("2026-07-12T00:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("keeps expired history but excludes future and invalid announcements", () => {
    const announcements: PublicAnnouncement[] = [
      {
        ...BASE_ANNOUNCEMENT,
        id: "expired-history",
        expiresAt: "2026-07-05T00:00:00.000Z",
      },
      {
        ...BASE_ANNOUNCEMENT,
        id: "future",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        ...BASE_ANNOUNCEMENT,
        id: "invalid",
        publishedAt: "not-a-date",
      },
    ];

    expect(
      listPublishedAnnouncements(
        announcements,
        new Date("2026-07-12T00:00:00.000Z"),
      ).map((announcement) => announcement.id),
    ).toEqual(["expired-history"]);
  });
});
