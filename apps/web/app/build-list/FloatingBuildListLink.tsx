// apps/web/app/build-list/FloatingBuildListLink.tsx
import Link from "next/link";
import { formatBuildListPrice } from "./formatting";
import type { BuildListSummary } from "./model";

export default function FloatingBuildListLink({ summary }: { summary: BuildListSummary }) {
  return (
    <Link
      aria-label={`開啟配單，目前 ${summary.totalQuantity} 件，總價 ${formatBuildListPrice(summary.totalAmount)}`}
      className="build-list-floating-link"
      href="/build-list"
      title="開啟配單"
    >
      <svg
        className="build-list-floating-icon"
        aria-hidden="true"
        fill="none"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M4 5h2l2.1 10.2a2 2 0 0 0 2 1.6h6.4a2 2 0 0 0 1.9-1.4L20 9H7.2" />
        <path d="M10 20h.01M17 20h.01" />
      </svg>
      <span className="build-list-floating-badge" aria-hidden="true">
        {summary.totalQuantity}
      </span>
      <span className="sr-only">{formatBuildListPrice(summary.totalAmount)}</span>
    </Link>
  );
}
