// apps/crawler/src/coolpc/raw-snapshot-cleanup/files.ts

import { lstat, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export function validateCompressedHtmlPaths(
  storageDir: string,
  compressedHtmlPaths: string[],
): void {
  for (const relativePath of compressedHtmlPaths) {
    resolveCompressedHtmlPath(storageDir, relativePath);
  }
}

export async function preflightCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<void> {
  for (const relativePath of compressedHtmlPaths) {
    const outputPath = resolveCompressedHtmlPath(storageDir, relativePath);

    try {
      const stats = await lstat(outputPath);

      if (!stats.isFile()) {
        throw new Error(
          `Refusing to delete raw snapshot path because it is not a regular file: ${relativePath}`,
        );
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

export async function deleteCompressedHtmlFiles(
  storageDir: string,
  compressedHtmlPaths: string[],
): Promise<{ deleted: number; missing: number }> {
  let deleted = 0;
  let missing = 0;

  for (const relativePath of compressedHtmlPaths) {
    try {
      await unlink(resolveCompressedHtmlPath(storageDir, relativePath));
      deleted += 1;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        missing += 1;
        continue;
      }

      throw error;
    }
  }

  return { deleted, missing };
}

function resolveCompressedHtmlPath(storageDir: string, relativePath: string): string {
  if (!relativePath) {
    throw new Error("Raw snapshot compressed_html_path must not be empty.");
  }

  if (isAbsolute(relativePath)) {
    throw new Error(`Refusing to delete absolute raw snapshot path: ${relativePath}`);
  }

  const root = resolve(storageDir);
  const outputPath = resolve(root, relativePath);
  const relativeOutputPath = relative(root, outputPath);

  if (relativeOutputPath === "") {
    throw new Error(`Refusing to delete raw snapshot storage root: ${relativePath}`);
  }

  if (relativeOutputPath.startsWith("..") || isAbsolute(relativeOutputPath)) {
    throw new Error(`Refusing to delete raw snapshot path outside storage dir: ${relativePath}`);
  }

  return outputPath;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
