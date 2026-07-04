import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtureDir = join(__dirname, "fixtures");

export function createCategorySnapshotTestEnvironment() {
  const tempDirs: string[] = [];

  return {
    cleanup: async () => {
      await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
    },
    createStorageDir: async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "partsradar-category-snapshot-"));
      tempDirs.push(tempDir);
      return tempDir;
    },
    fixture: (name: string) => readFile(join(fixtureDir, name), "utf8"),
  };
}
