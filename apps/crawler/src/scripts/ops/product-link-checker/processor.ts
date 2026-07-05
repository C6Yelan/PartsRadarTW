// apps/crawler/src/scripts/ops/product-link-checker/processor.ts
import type { ProductLinkCheckerOptions, ProductLinkCheckerSummary } from "./options";
import { toSummaryKey } from "./options";
import { fetchProductLink } from "./fetch";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  type LinkCheckOutcome,
  type ProductPurchaseLinkTarget,
  type ProductLinkCheckerDependencies,
  type ProductLinkHealthClient,
  type ProductLinkHealthWriteData,
} from "./types";

export { buildProductPurchaseLinkTargets, readProductPurchaseLinkTargets } from "./candidates";
export { fetchProductLink } from "./fetch";
export {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
  PRODUCT_LINK_SELECT,
} from "./types";
export type {
  LinkCheckOutcome,
  ProductPurchaseLinkTarget,
  ProductLinkCheckerDependencies,
  ProductLinkHealthClient,
  ProductLinkHealthRecord,
  ProductLinkHealthStatusValue,
  ProductLinkKindValue,
  ProductLinkProductRecord,
} from "./types";

export async function checkProductLinks(
  client: ProductLinkHealthClient,
  purchaseLinkTargets: ProductPurchaseLinkTarget[],
  options: ProductLinkCheckerOptions,
  dependencies: ProductLinkCheckerDependencies = {},
): Promise<ProductLinkCheckerSummary> {
  const summary: ProductLinkCheckerSummary = {
    selected: purchaseLinkTargets.length,
    checked: 0,
    dryRun: 0,
    ok: 0,
    broken: 0,
    temporaryError: 0,
    liveRequests: 0,
    pausedForPriority: false,
  };
  const log = dependencies.log ?? console.log;
  const debugLog = dependencies.debugLog ?? (() => {});
  const fetchLink = dependencies.fetchLink ?? fetchProductLink;
  const sleep = dependencies.delay ?? delay;
  const now = dependencies.now ?? (() => new Date());
  const shouldPause = dependencies.shouldPause ?? (() => false);

  log(`Selected ${purchaseLinkTargets.length} product purchase link target(s).`);
  log(
    options.dryRun
      ? "Mode: dry run; no external requests will be sent."
      : `Mode: live check; delay between requests is ${options.minDelayMs}-${options.maxDelayMs}ms.`,
  );
  log("");

  for (const purchaseLinkTarget of purchaseLinkTargets) {
    if (await shouldPause()) {
      summary.pausedForPriority = true;
      log("Pausing product link health checks for a higher-priority external fetch task.");
      break;
    }

    if (options.dryRun) {
      summary.dryRun += 1;
      debugLog(
        `[dry-run] ${formatPurchaseLinkTarget(purchaseLinkTarget)} | ${purchaseLinkTarget.url}`,
      );
      continue;
    }

    if (summary.liveRequests > 0) {
      const waitMs = randomDelayMs(options.minDelayMs, options.maxDelayMs);
      debugLog(`Waiting ${waitMs}ms before the next link request...`);
      await sleep(waitMs);

      if (await shouldPause()) {
        summary.pausedForPriority = true;
        log("Pausing product link health checks for a higher-priority external fetch task.");
        break;
      }
    }

    const checkedAt = now();
    const outcome = await fetchLink(purchaseLinkTarget.url, options);
    const writeData = resolveNextProductLinkHealth(purchaseLinkTarget, outcome, checkedAt, options);

    await client.productLinkHealth.upsert({
      where: {
        productId_linkKind: {
          productId: purchaseLinkTarget.productId,
          linkKind: purchaseLinkTarget.linkKind,
        },
      },
      create: {
        productId: purchaseLinkTarget.productId,
        linkKind: purchaseLinkTarget.linkKind,
        ...writeData,
      },
      update: writeData,
      select: { id: true },
    });

    summary.checked += 1;
    summary.liveRequests += 1;
    summary[toSummaryKey(writeData.status)] += 1;

    const statusSuffix =
      writeData.httpStatus === null
        ? writeData.status
        : `${writeData.status} HTTP ${writeData.httpStatus}`;
    const statusLog = writeData.status === PRODUCT_LINK_HEALTH_STATUSES.OK ? debugLog : log;
    statusLog(`[${statusSuffix}] ${formatPurchaseLinkTarget(purchaseLinkTarget)}`);
  }

  return summary;
}

export function resolveNextProductLinkHealth(
  purchaseLinkTarget: ProductPurchaseLinkTarget,
  outcome: LinkCheckOutcome,
  checkedAt: Date,
  options: Pick<ProductLinkCheckerOptions, "failureThreshold">,
): ProductLinkHealthWriteData {
  const existingHealth =
    purchaseLinkTarget.existingHealth?.url === purchaseLinkTarget.url
      ? purchaseLinkTarget.existingHealth
      : null;

  if (outcome.status === "ok") {
    return {
      url: purchaseLinkTarget.url,
      status: PRODUCT_LINK_HEALTH_STATUSES.OK,
      httpStatus: outcome.httpStatus,
      checkedAt,
      lastOkAt: checkedAt,
      lastFailureAt: existingHealth?.lastFailureAt ?? null,
      failureCount: 0,
      errorMessage: null,
    };
  }

  const nextFailureCount = (existingHealth?.failureCount ?? 0) + 1;
  const status =
    outcome.status === "broken" && nextFailureCount >= options.failureThreshold
      ? PRODUCT_LINK_HEALTH_STATUSES.BROKEN
      : PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR;

  return {
    url: purchaseLinkTarget.url,
    status,
    httpStatus: outcome.httpStatus,
    checkedAt,
    lastOkAt: existingHealth?.lastOkAt ?? null,
    lastFailureAt: checkedAt,
    failureCount: nextFailureCount,
    errorMessage: outcome.errorMessage,
  };
}

function formatPurchaseLinkTarget(target: ProductPurchaseLinkTarget): string {
  return `${target.linkKind.toLowerCase()} | ${target.productId} | ${target.categoryLabel} | ${target.productName}`;
}

function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
