// apps/crawler/tests/scripts/ops/cloudflare-tunnel.test.ts
// 驗證 tunnel token 只透過 file secret 交付，且 production preflight 會 fail closed。

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(__dirname, "../../../../..");
const COMPOSE_FILE = join(WORKSPACE_ROOT, "compose.tunnel.yml");
const VALIDATOR = join(WORKSPACE_ROOT, "scripts/ops/validate-cloudflare-tunnel.sh");
const PINNED_IMAGE =
  "cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d";
const TOKEN_FILE_PATH = "/run/secrets/cloudflare_tunnel_token";
const tempRoots: string[] = [];

function createTempWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "partsradar-cloudflare-tunnel-"));
  tempRoots.push(root);
  const target = join(root, "scripts/ops/validate-cloudflare-tunnel.sh");
  mkdirSync(dirname(target), { recursive: true });
  cpSync(VALIDATOR, target);
  chmodSync(target, 0o755);
  return root;
}

function runValidator(root: string, env: NodeJS.ProcessEnv = {}, pathPrefix?: string) {
  return spawnSync(join(root, "scripts/ops/validate-cloudflare-tunnel.sh"), {
    cwd: root,
    env: {
      PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

function writeFakeStat(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const stat = join(bin, "stat");
  writeFileSync(stat, "#!/usr/bin/env sh\nprintf '0 65532 440 32\\n'\n");
  chmodSync(stat, 0o755);
  return bin;
}

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Cloudflare Tunnel Compose contract", () => {
  it("uses a pinned image and grants only a file secret path", () => {
    const compose = readFileSync(COMPOSE_FILE, "utf8");
    const envExample = readFileSync(join(WORKSPACE_ROOT, ".env.example"), "utf8");
    const productionEntrypoint = readFileSync(
      join(WORKSPACE_ROOT, "scripts/ops/compose-production.sh"),
      "utf8",
    );

    expect(compose).toContain(PINNED_IMAGE);
    expect(compose).toContain("TUNNEL_TOKEN_FILE: /run/secrets/cloudflare_tunnel_token");
    expect(compose).toContain("source: cloudflare_tunnel_token");
    expect(compose).toContain("CLOUDFLARE_TUNNEL_TOKEN_FILE");
    expect(compose).not.toContain('"--token"');
    expect(compose).not.toMatch(/\$\{CLOUDFLARE_TUNNEL_TOKEN(?=[:}])/);
    expect(envExample).toContain("CLOUDFLARE_TUNNEL_TOKEN_FILE=");
    expect(envExample).not.toContain("CLOUDFLARE_TUNNEL_TOKEN=");
    expect(productionEntrypoint).toContain("scripts/ops/validate-cloudflare-tunnel.sh");
  });

  it("keeps repository secret directories out of Git and Docker build contexts", () => {
    const gitignore = readFileSync(join(WORKSPACE_ROOT, ".gitignore"), "utf8");
    const dockerignore = readFileSync(join(WORKSPACE_ROOT, ".dockerignore"), "utf8");

    for (const pattern of ["secrets/", "**/secrets/"]) {
      expect(gitignore).toContain(pattern);
      expect(dockerignore).toContain(pattern);
    }
  });
});

describe("Cloudflare Tunnel production preflight", () => {
  it("accepts a non-empty restricted file readable by the cloudflared runtime group", () => {
    const root = createTempWorkspace();
    const tokenFile = join(root, "tunnel-token");
    writeFileSync(tokenFile, "sentinel-value");
    const fakeBin = writeFakeStat(root);

    const result = runValidator(
      root,
      {
        CLOUDFLARED_IMAGE: PINNED_IMAGE,
        CLOUDFLARE_TUNNEL_TOKEN_FILE: tokenFile,
      },
      fakeBin,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-value");
  });

  it.each([
    ["missing", undefined, undefined],
    ["empty", "", 0o440],
    ["unreadable", "sentinel-value", 0o000],
    ["world-readable", "sentinel-value", 0o444],
  ])("rejects a %s token file without printing its content", (_case, content, mode) => {
    const root = createTempWorkspace();
    const tokenFile = join(root, "tunnel-token");
    if (content !== undefined) {
      writeFileSync(tokenFile, content);
      chmodSync(tokenFile, mode as number);
    }

    const result = runValidator(root, {
      CLOUDFLARED_IMAGE: PINNED_IMAGE,
      CLOUDFLARE_TUNNEL_TOKEN_FILE: tokenFile,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cloudflare Tunnel preflight failed:");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-value");
  });

  it.each([
    "cloudflare/cloudflared:latest",
    "cloudflare/cloudflared:replace_with_pinned_version",
    "cloudflare/cloudflared:2026.7",
    "cloudflare/cloudflared:2026.7.2",
  ])("rejects a mutable or placeholder image reference: %s", (image) => {
    const root = createTempWorkspace();
    const tokenFile = join(root, "tunnel-token");
    writeFileSync(tokenFile, "sentinel-value");

    const result = runValidator(root, {
      CLOUDFLARED_IMAGE: image,
      CLOUDFLARE_TUNNEL_TOKEN_FILE: tokenFile,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLOUDFLARED_IMAGE");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-value");
  });

  it("rejects legacy token environment delivery", () => {
    const root = createTempWorkspace();
    const tokenFile = join(root, "tunnel-token");
    writeFileSync(tokenFile, "sentinel-value");

    const result = runValidator(root, {
      CLOUDFLARED_IMAGE: PINNED_IMAGE,
      CLOUDFLARE_TUNNEL_TOKEN: "sentinel-value",
      CLOUDFLARE_TUNNEL_TOKEN_FILE: tokenFile,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("legacy token environment");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-value");
  });

  it("rejects a legacy token key in the Compose dotenv file", () => {
    const root = createTempWorkspace();
    const tokenFile = join(root, "tunnel-token");
    writeFileSync(tokenFile, "sentinel-value");
    writeFileSync(join(root, ".env"), "export CLOUDFLARE_TUNNEL_TOKEN=sentinel-value\n");

    const result = runValidator(root, {
      CLOUDFLARED_IMAGE: PINNED_IMAGE,
      CLOUDFLARE_TUNNEL_TOKEN_FILE: tokenFile,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("legacy token environment");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-value");
  });
});

const dockerAvailable =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0 &&
  spawnSync("docker", ["image", "inspect", PINNED_IMAGE], { stdio: "ignore" }).status === 0;

describe.skipIf(!dockerAvailable)("Cloudflare Tunnel container config", () => {
  it("keeps the sentinel out of expanded config, argv, and environment", () => {
    const root = mkdtempSync(join(tmpdir(), "partsradar-cloudflare-compose-"));
    tempRoots.push(root);
    const tokenFile = join(root, "tunnel-token");
    const envFile = join(root, "compose.env");
    const testOverride = join(root, "compose.test.yml");
    const project = `partsradar-rc02-${process.pid}`;
    writeFileSync(tokenFile, "sentinel-cloudflare-token");
    writeFileSync(
      envFile,
      [
        "POSTGRES_DB=sentinel_db",
        "POSTGRES_USER=sentinel_admin",
        "POSTGRES_PASSWORD=sentinel_admin_password",
        "POSTGRES_RUNTIME_USER=sentinel_runtime",
        "POSTGRES_RUNTIME_PASSWORD=sentinel_runtime_password",
        `CLOUDFLARED_IMAGE=${PINNED_IMAGE}`,
        `CLOUDFLARE_TUNNEL_TOKEN_FILE=${tokenFile}`,
        "",
      ].join("\n"),
    );
    writeFileSync(
      testOverride,
      ["services:", "  cloudflared:", "    depends_on: !reset {}", ""].join("\n"),
    );

    const composeArgs = [
      "compose",
      "--env-file",
      envFile,
      "--project-name",
      project,
      "-f",
      join(WORKSPACE_ROOT, "compose.yml"),
      "-f",
      COMPOSE_FILE,
      "-f",
      testOverride,
      "--profile",
      "public-tunnel",
    ];

    try {
      const expanded = execFileSync("docker", [...composeArgs, "config"], {
        encoding: "utf8",
      });
      expect(expanded).not.toContain("sentinel-cloudflare-token");

      execFileSync("docker", [...composeArgs, "create", "--no-build", "cloudflared"], {
        stdio: "pipe",
      });
      const containerId = execFileSync("docker", [...composeArgs, "ps", "-aq", "cloudflared"], {
        encoding: "utf8",
      }).trim();
      const inspected = JSON.parse(
        execFileSync("docker", ["inspect", containerId], { encoding: "utf8" }),
      )[0] as {
        Args: string[];
        Config: { Cmd: string[]; Entrypoint: string[]; Env: string[] };
        Mounts: Array<{ Destination: string; Source: string }>;
        Path: string;
      };

      const argv = [
        inspected.Path,
        ...(inspected.Args ?? []),
        ...(inspected.Config.Entrypoint ?? []),
        ...(inspected.Config.Cmd ?? []),
      ];
      const env = inspected.Config.Env ?? [];
      expect(argv).not.toContain("--token");
      expect(argv.join("\n")).not.toContain("sentinel-cloudflare-token");
      expect(env).toContain(`TUNNEL_TOKEN_FILE=${TOKEN_FILE_PATH}`);
      expect(env.some((entry) => entry.startsWith("TUNNEL_TOKEN="))).toBe(false);
      expect(env.some((entry) => entry.startsWith("CLOUDFLARE_TUNNEL_TOKEN="))).toBe(false);
      expect(inspected.Mounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Destination: TOKEN_FILE_PATH,
            Source: tokenFile,
          }),
        ]),
      );
    } finally {
      spawnSync("docker", [...composeArgs, "down", "--remove-orphans"], {
        stdio: "ignore",
      });
    }
  }, 30_000);
});
