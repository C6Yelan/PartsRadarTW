import { afterEach, describe, expect, it } from "vitest";
import {
  CRAWL_RUN_CATEGORY_RESULT_STATUSES,
  CRAWL_RUN_STATUSES,
  runCoolpcCrawlOnce,
} from "../../src/coolpc/crawl-run";
import { processCoolpcCategorySnapshot } from "../../src/coolpc/category-snapshot";
import { createCategorySnapshotTestEnvironment } from "./category-snapshot-support";
import {
  category,
  createProductWriterSpy,
  FakeCrawlerWriteClient,
  fixedClock,
  snapshot,
} from "./support/category-snapshot-client";

describe("CoolPC category snapshot crawl run integration", () => {
  const testEnv = createCategorySnapshotTestEnvironment();

  afterEach(testEnv.cleanup);

  it("passes raw snapshot ids into crawl run category results and stops on suspected block", async () => {
    const client = new FakeCrawlerWriteClient([
      category({ id: "category-4", igrp: 4 }),
      category({ id: "category-5", igrp: 5, displayName: "主機板", sourceName: "主機板 MB" }),
    ]);
    const storageDir = await testEnv.createStorageDir();
    const suspectedBlockHtml = await testEnv.fixture("http-200.non-product.html");
    const productWriter = createProductWriterSpy();

    const result = await runCoolpcCrawlOnce({
      client,
      now: fixedClock(),
      processCategory: ({ crawlRunId, category: sourceCategory }) =>
        processCoolpcCategorySnapshot({
          client,
          storageDir,
          crawlRunId,
          category: sourceCategory,
          snapshot: snapshot({ rawHtml: suspectedBlockHtml }),
          writeProducts: productWriter.writeProducts,
        }),
    });

    expect(result.status).toBe(CRAWL_RUN_STATUSES.SUSPECTED_BLOCK);
    expect(result.stoppedBySuspectedBlock).toBe(true);
    expect(result.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        status: CRAWL_RUN_CATEGORY_RESULT_STATUSES.SUSPECTED_BLOCK,
        rawSnapshotId: "raw-snapshot-1",
      }),
    ]);
    expect(client.categoryResults).toEqual([
      expect.objectContaining({
        sourceCategoryId: "category-4",
        rawSnapshotId: "raw-snapshot-1",
      }),
    ]);
    expect(client.rawSnapshots).toHaveLength(1);
    expect(productWriter.calls).toEqual([]);
  });
});
