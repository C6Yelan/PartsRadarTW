// apps/crawler/src/coolpc/raw-snapshot-storage.ts
// 驗證 raw snapshot storage allowlist，並提供綁定 allowlisted root 的 feature-local mutation lock。

import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { type FilesystemLockHandle, tryAcquireFilesystemLock } from "../shared/filesystem-lock";

export const DEFAULT_RAW_SNAPSHOT_STORAGE_DIR = "temp/coolpc-daemon/snapshots";
const DEFAULT_RAW_SNAPSHOT_MUTATION_LOCK_STALE_SECONDS = 5 * 60;

export interface RawSnapshotStorageLocation {
  storageDir: string;
  mutationRoot: string;
  storagePathPrefix: string;
}

interface AllowedStorageRoot {
  path: string;
  mustRemainInWorkspace: boolean;
}

interface ResolveAllowlistedRawSnapshotStorageOptions {
  workspaceRoot: string;
  requestedDir: string;
  configuredDir?: string | null;
  additionalAllowedRootsForTesting?: string[];
}

interface TryAcquireRawSnapshotMutationLockOptions {
  mutationRoot: string;
  owner: string;
  staleSeconds?: number;
  now?: () => Date;
}

export type RawSnapshotMutationLockHandle = FilesystemLockHandle;

// requested path 必須先落在明確 root 下，再以 canonical path 複核，避免 parent/sibling 與 symlink escape。
export function resolveAllowlistedRawSnapshotStorage({
  workspaceRoot,
  requestedDir,
  configuredDir = null,
  additionalAllowedRootsForTesting = [],
}: ResolveAllowlistedRawSnapshotStorageOptions): RawSnapshotStorageLocation {
  if (additionalAllowedRootsForTesting.length > 0 && process.env.NODE_ENV !== "test") {
    throw new Error("Additional raw snapshot storage roots are test-only.");
  }

  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const resolvedRequestedDir = resolvePathInput(
    resolvedWorkspaceRoot,
    requestedDir,
    "snapshot storage dir",
  );
  const canonicalWorkspaceRoot = resolveCanonicalPath(resolvedWorkspaceRoot);
  const activeRoot: AllowedStorageRoot =
    configuredDir === null || configuredDir === undefined
      ? {
          path: resolve(resolvedWorkspaceRoot, DEFAULT_RAW_SNAPSHOT_STORAGE_DIR),
          mustRemainInWorkspace: true,
        }
      : {
          path: resolvePathInput(resolvedWorkspaceRoot, configuredDir, "SNAPSHOT_STORAGE_DIR"),
          mustRemainInWorkspace: !isAbsolute(configuredDir),
        };
  const allowedRoots = [
    activeRoot,
    ...additionalAllowedRootsForTesting.map(
      (root): AllowedStorageRoot => ({
        path: resolvePathInput(resolvedWorkspaceRoot, root, "additional snapshot storage root"),
        mustRemainInWorkspace: !isAbsolute(root),
      }),
    ),
  ].filter(
    (root, index, roots) => roots.findIndex((candidate) => candidate.path === root.path) === index,
  );

  rejectUnsafeRoot(resolvedRequestedDir, resolvedWorkspaceRoot, requestedDir);

  for (const allowedRoot of allowedRoots) {
    rejectUnsafeRoot(allowedRoot.path, resolvedWorkspaceRoot, allowedRoot.path);
    const canonicalRoot = resolveCanonicalPath(allowedRoot.path);
    const canonicalStorageDir = resolveCanonicalPath(resolvedRequestedDir);
    rejectUnsafeRoot(canonicalRoot, canonicalWorkspaceRoot, allowedRoot.path);
    rejectUnsafeRoot(canonicalStorageDir, canonicalWorkspaceRoot, requestedDir);
    const isLexicallyWithinRoot = isPathWithin(resolvedRequestedDir, allowedRoot.path);
    const isCanonicallyWithinRoot = isPathWithin(canonicalStorageDir, canonicalRoot);

    if (allowedRoot.mustRemainInWorkspace && !isPathWithin(canonicalRoot, canonicalWorkspaceRoot)) {
      throw new Error(
        `Unsafe snapshot storage root "${allowedRoot.path}": symlink resolves outside the workspace.`,
      );
    }

    if (isLexicallyWithinRoot && !isCanonicallyWithinRoot) {
      throw new Error(
        `Unsafe snapshot storage dir "${requestedDir}": symlink resolves outside its allowlisted root.`,
      );
    }

    if (!isLexicallyWithinRoot && !isCanonicallyWithinRoot) {
      continue;
    }

    const storagePathPrefix = toStoragePathPrefix(relative(canonicalRoot, canonicalStorageDir));

    if (storagePathPrefix === ".locks" || storagePathPrefix.startsWith(".locks/")) {
      throw new Error(
        `Unsafe snapshot storage dir "${requestedDir}": the reserved .locks directory cannot store snapshots.`,
      );
    }

    return {
      storageDir: canonicalStorageDir,
      mutationRoot: canonicalRoot,
      storagePathPrefix,
    };
  }

  throw new Error(
    `Unsafe snapshot storage dir "${requestedDir}": path is not within an allowlisted snapshot storage root.`,
  );
}

function toStoragePathPrefix(relativePath: string): string {
  return relativePath === "" ? "" : relativePath.split("\\").join("/");
}

// mutation lock 固定放在 matched allowlisted root，讓 root 與其 controlled child 共用同一把鎖。
export async function tryAcquireRawSnapshotMutationLock({
  mutationRoot,
  owner,
  staleSeconds = DEFAULT_RAW_SNAPSHOT_MUTATION_LOCK_STALE_SECONDS,
  now,
}: TryAcquireRawSnapshotMutationLockOptions): Promise<RawSnapshotMutationLockHandle | null> {
  const canonicalMutationRoot = resolveCanonicalPath(mutationRoot);
  const requestedLockParent = join(canonicalMutationRoot, ".locks");
  rejectSymlinkIfPresent(requestedLockParent, "Raw snapshot mutation lock parent");
  const lockParent = resolveCanonicalPath(requestedLockParent);

  if (!isPathWithin(lockParent, canonicalMutationRoot)) {
    throw new Error("Raw snapshot mutation lock path resolves outside its storage root.");
  }

  return tryAcquireFilesystemLock({
    lockDir: join(lockParent, "raw-snapshot-mutation"),
    owner,
    staleSeconds,
    now,
  });
}

function rejectSymlinkIfPresent(path: string, label: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${path}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function resolvePathInput(workspaceRoot: string, value: string, label: string): string {
  if (value.trim() === "") {
    throw new Error(`Unsafe ${label} "${value}": value must not be empty.`);
  }

  return isAbsolute(value) ? resolve(value) : resolve(workspaceRoot, value);
}

// 允許尚未建立的受控 child，但會 realpath 最近存在 ancestor；broken symlink 與其他 realpath 錯誤一律拒絕。
function resolveCanonicalPath(path: string): string {
  let currentPath = resolve(path);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const canonicalAncestor = realpathSync(currentPath);

      if (!statSync(canonicalAncestor).isDirectory()) {
        throw new Error(`Snapshot storage path is not a directory: ${currentPath}`);
      }

      return resolve(canonicalAncestor, ...missingSegments.reverse());
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw new Error(
          `Unable to resolve snapshot storage path "${path}": ${errorMessage(error)}`,
        );
      }

      try {
        if (lstatSync(currentPath).isSymbolicLink()) {
          throw new Error(`Unable to resolve snapshot storage symlink "${currentPath}".`);
        }
      } catch (lstatError) {
        if (!isNodeError(lstatError) || lstatError.code !== "ENOENT") {
          throw lstatError;
        }
      }

      const parentPath = dirname(currentPath);

      if (parentPath === currentPath) {
        throw new Error(`Unable to resolve snapshot storage path "${path}".`);
      }

      missingSegments.push(basename(currentPath));
      currentPath = parentPath;
    }
  }
}

function rejectUnsafeRoot(path: string, workspaceRoot: string, input: string): void {
  if (parse(path).root === path) {
    throw new Error(`Unsafe snapshot storage dir "${input}": filesystem root cannot be used.`);
  }

  if (path === workspaceRoot) {
    throw new Error(`Unsafe snapshot storage dir "${input}": workspace root cannot be used.`);
  }
}

function isPathWithin(path: string, root: string): boolean {
  const relativePath = relative(root, path);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
