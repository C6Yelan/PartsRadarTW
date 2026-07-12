// apps/web/app/AnnouncementTopbarLink.tsx
// 提供全站 topbar 的公告入口。

import Link from "next/link";

export default function AnnouncementTopbarLink() {
  return (
    <Link className="topbar-nav-link" href="/announcements">
      公告
    </Link>
  );
}
