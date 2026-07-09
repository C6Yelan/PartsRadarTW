// apps/web/next.config.ts
// 設定 Next.js build/runtime 行為，載入 workspace env 並集中套用 CSP 與安全 headers。

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceEnvFile = join(workspaceRoot, ".env");

if (existsSync(workspaceEnvFile)) {
  process.loadEnvFile(workspaceEnvFile);
}

const isDevelopment = process.env.NODE_ENV !== "production";
const cspMode = process.env.CSP_MODE === "report-only" ? "report-only" : "enforce";
const cspReportUri = resolveCspReportUri(process.env.CSP_REPORT_URI);
const cspHeaderName =
  cspMode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self'${isDevelopment ? " http: ws:" : ""}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ...(cspReportUri ? [`report-uri ${cspReportUri}`] : []),
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: cspHeaderName,
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
  transpilePackages: ["@partsradar/db", "@partsradar/shared"],
};

function resolveCspReportUri(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("/")) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);

    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default nextConfig;
