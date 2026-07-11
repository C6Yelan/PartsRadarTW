// apps/web/app/announcements/PublicAnnouncementBanner.tsx
// 在首頁主要工作區上方顯示目前有效的 pinned 公告。

import Link from "next/link";
import type { PublicAnnouncement } from "./data";

export default function PublicAnnouncementBanner({
  announcement,
}: {
  announcement: PublicAnnouncement | null;
}) {
  if (!announcement) {
    return null;
  }

  return (
    <aside
      aria-label="網站公告"
      className={`public-announcement is-${announcement.severity}`}
      role="status"
    >
      <span className="public-announcement-label">公告</span>
      <div className="public-announcement-copy">
        <strong>{announcement.title}</strong>
        <p>{announcement.summary}</p>
      </div>
      <Link className="public-announcement-link" href={`/announcements#${announcement.id}`}>
        查看完整公告
      </Link>
    </aside>
  );
}
