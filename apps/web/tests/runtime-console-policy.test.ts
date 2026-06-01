import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_RUNTIME_ROOT = join(__dirname, "../app");
const RUNTIME_SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CONSOLE_CALL_PATTERN = /\bconsole\.(?:debug|error|info|log|trace|warn)\b/;

describe("web runtime console policy", () => {
  it("does not ship console calls in app runtime source", async () => {
    const files = await collectRuntimeSourceFiles(WEB_RUNTIME_ROOT);
    const filesWithConsoleCalls: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      if (CONSOLE_CALL_PATTERN.test(source)) {
        filesWithConsoleCalls.push(file);
      }
    }

    expect(filesWithConsoleCalls).toEqual([]);
  });
});

async function collectRuntimeSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectRuntimeSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && RUNTIME_SOURCE_EXTENSIONS.has(getExtension(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");

  return dotIndex === -1 ? "" : fileName.slice(dotIndex);
}
