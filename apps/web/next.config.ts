import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const workspaceEnvFile = join(workspaceRoot, ".env");

if (existsSync(workspaceEnvFile)) {
  process.loadEnvFile(workspaceEnvFile);
}

const nextConfig: NextConfig = {
  transpilePackages: ["@partsradar/db"],
};

export default nextConfig;
