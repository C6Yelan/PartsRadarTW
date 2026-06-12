// apps/crawler/src/scripts/ops/product-link-checker/processor.ts
import type { Prisma } from "@partsradar/db";
import { createCoolpcPurchaseUrl } from "@partsradar/shared";
import { toSafeCliErrorMessage } from "../../shared/script-utils";
import type { ProductLinkCheckerOptions, ProductLinkCheckerSummary } from "./options";
import { toSummaryKey } from "./options";

export const PRODUCT_LINK_KINDS = {
  // SOURCE matches the public API source.url purchase link, not products.source_url.
  SOURCE: "SOURCE",
} as const;

export const PRODUCT_LINK_HEALTH_STATUSES = {
  OK: "OK",
  BROKEN: "BROKEN",
  TEMPORARY_ERROR: "TEMPORARY_ERROR",
} as const;

export type ProductLinkKindValue =
  (typeof PRODUCT_LINK_KINDS)[keyof typeof PRODUCT_LINK_KINDS];
export type ProductLinkHealthStatusValue =
  (typeof PRODUCT_LINK_HEALTH_STATUSES)[keyof typeof PRODUCT_LINK_HEALTH_STATUSES];

export const PRODUCT_LINK_SELECT = {
  id: true,
  name: true,
  ibuyToken: true,
  sourceCategory: {
    select: {
      igrp: true,
      displayName: true,
    },
  },
  linkHealthChecks: {
    select: {
      linkKind: true,
      url: true,
      status: true,
      httpStatus: true,
      checkedAt: true,
      lastOkAt: true,
      lastFailureAt: true,
      failureCount: true,
    },
  },
} as const satisfies Prisma.ProductSelect;

export type ProductLinkProductRecord = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_LINK_SELECT;
}>;
export type ProductLinkHealthRecord = ProductLinkProductRecord["linkHealthChecks"][number];

type ProductLinkFindManyArgs = Omit<Prisma.ProductFindManyArgs, "select"> & {
  select: typeof PRODUCT_LINK_SELECT;
};

interface ProductLinkHealthUpsertArgs {
  where: {
    productId_linkKind: {
      productId: string;
      linkKind: ProductLinkKindValue;
    };
  };
  create: ProductLinkHealthWriteData & {
    productId: string;
    linkKind: ProductLinkKindValue;
  };
  update: ProductLinkHealthWriteData;
  select: { id: true };
}

interface ProductLinkHealthWriteData {
  url: string;
  status: ProductLinkHealthStatusValue;
  httpStatus: number | null;
  checkedAt: Date;
  lastOkAt: Date | null;
  lastFailureAt: Date | null;
  failureCount: number;
  errorMessage: string | null;
}

export interface ProductLinkHealthClient {
  product: {
    findMany(args: ProductLinkFindManyArgs): Promise<ProductLinkProductRecord[]>;
  };
  productLinkHealth: {
    upsert(args: ProductLinkHealthUpsertArgs): Promise<{ id: string }>;
  };
}

export interface ProductLinkCandidate {
  productId: string;
  productName: string;
  categoryLabel: string;
  linkKind: ProductLinkKindValue;
  url: string;
  existingHealth: ProductLinkHealthRecord | null;
}

export interface LinkCheckOutcome {
  status: "ok" | "broken" | "temporary_error";
  httpStatus: number | null;
  errorMessage: string | null;
}

export interface ProductLinkCheckerDependencies {
  fetchLink?: (url: string, options: ProductLinkCheckerOptions) => Promise<LinkCheckOutcome>;
  delay?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  now?: () => Date;
  shouldPause?: () => Promise<boolean> | boolean;
}

export async function readProductLinkCandidates(
  client: ProductLinkHealthClient,
  options: ProductLinkCheckerOptions,
  now = new Date(),
): Promise<ProductLinkCandidate[]> {
  const products = await client.product.findMany({
    where: {
      isActive: true,
      primaryImageUrl: { not: null },
      primaryImageCheckedAt: { not: null },
      currentPrice: { isNot: null },
      sourceCategory: {
        enabled: true,
        ...(options.igrp === null ? {} : { igrp: options.igrp }),
      },
    },
    select: PRODUCT_LINK_SELECT,
    orderBy: [{ sourceCategory: { igrp: "asc" } }, { id: "asc" }],
    take: undefined,
  });
  const candidates = buildProductLinkCandidates(products, options, now);

  return options.limit === null ? candidates : candidates.slice(0, options.limit);
}

export function buildProductLinkCandidates(
  products: ProductLinkProductRecord[],
  options: ProductLinkCheckerOptions,
  now: Date,
): ProductLinkCandidate[] {
  const staleBefore = new Date(now.getTime() - options.staleAfterHours * 60 * 60 * 1000);
  const candidates: ProductLinkCandidate[] = [];

  for (const product of products) {
    const links = buildProductLinks(product, options);

    for (const link of links) {
      const existingHealth =
        product.linkHealthChecks.find((health) => health.linkKind === link.linkKind) ?? null;

      if (!shouldCheckLink(link.url, existingHealth, staleBefore)) {
        continue;
      }

      candidates.push({
        productId: product.id,
        productName: product.name,
        categoryLabel: `${product.sourceCategory.displayName} IGrp=${product.sourceCategory.igrp}`,
        linkKind: link.linkKind,
        url: link.url,
        existingHealth,
      });
    }
  }

  return candidates.sort(compareProductLinkCandidates);
}

export async function checkProductLinks(
  client: ProductLinkHealthClient,
  candidates: ProductLinkCandidate[],
  options: ProductLinkCheckerOptions,
  dependencies: ProductLinkCheckerDependencies = {},
): Promise<ProductLinkCheckerSummary> {
  const summary: ProductLinkCheckerSummary = {
    selected: candidates.length,
    checked: 0,
    dryRun: 0,
    ok: 0,
    broken: 0,
    temporaryError: 0,
    liveRequests: 0,
    pausedForPriority: false,
  };
  const log = dependencies.log ?? console.log;
  const fetchLink = dependencies.fetchLink ?? fetchProductLink;
  const sleep = dependencies.delay ?? delay;
  const now = dependencies.now ?? (() => new Date());
  const shouldPause = dependencies.shouldPause ?? (() => false);

  log(`Selected ${candidates.length} product link candidate(s).`);
  log(
    options.dryRun
      ? "Mode: dry run; no external requests will be sent."
      : `Mode: live check; delay between requests is ${options.minDelayMs}-${options.maxDelayMs}ms.`,
  );
  log("");

  for (const candidate of candidates) {
    if (await shouldPause()) {
      summary.pausedForPriority = true;
      log("Pausing product link health checks for a higher-priority external fetch task.");
      break;
    }

    if (options.dryRun) {
      summary.dryRun += 1;
      log(`[dry-run] ${formatCandidate(candidate)} | ${candidate.url}`);
      continue;
    }

    if (summary.liveRequests > 0) {
      const waitMs = randomDelayMs(options.minDelayMs, options.maxDelayMs);
      log(`Waiting ${waitMs}ms before the next link request...`);
      await sleep(waitMs);

      if (await shouldPause()) {
        summary.pausedForPriority = true;
        log("Pausing product link health checks for a higher-priority external fetch task.");
        break;
      }
    }

    const checkedAt = now();
    const outcome = await fetchLink(candidate.url, options);
    const writeData = resolveNextProductLinkHealth(candidate, outcome, checkedAt, options);

    await client.productLinkHealth.upsert({
      where: {
        productId_linkKind: {
          productId: candidate.productId,
          linkKind: candidate.linkKind,
        },
      },
      create: {
        productId: candidate.productId,
        linkKind: candidate.linkKind,
        ...writeData,
      },
      update: writeData,
      select: { id: true },
    });

    summary.checked += 1;
    summary.liveRequests += 1;
    summary[toSummaryKey(writeData.status)] += 1;

    const statusSuffix =
      writeData.httpStatus === null ? writeData.status : `${writeData.status} HTTP ${writeData.httpStatus}`;
    log(`[${statusSuffix}] ${formatCandidate(candidate)}`);
  }

  return summary;
}

export function resolveNextProductLinkHealth(
  candidate: ProductLinkCandidate,
  outcome: LinkCheckOutcome,
  checkedAt: Date,
  options: Pick<ProductLinkCheckerOptions, "failureThreshold">,
): ProductLinkHealthWriteData {
  const existingHealth =
    candidate.existingHealth?.url === candidate.url ? candidate.existingHealth : null;

  if (outcome.status === "ok") {
    return {
      url: candidate.url,
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
    url: candidate.url,
    status,
    httpStatus: outcome.httpStatus,
    checkedAt,
    lastOkAt: existingHealth?.lastOkAt ?? null,
    lastFailureAt: checkedAt,
    failureCount: nextFailureCount,
    errorMessage: outcome.errorMessage,
  };
}

export async function fetchProductLink(
  url: string,
  options: ProductLinkCheckerOptions,
): Promise<LinkCheckOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
        "user-agent":
          "PartsRadarTW product link health check (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        status: "ok",
        httpStatus: response.status,
        errorMessage: null,
      };
    }

    const status = response.status === 404 || response.status === 410 ? "broken" : "temporary_error";

    return {
      status,
      httpStatus: response.status,
      errorMessage: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "temporary_error",
      httpStatus: null,
      errorMessage: toSafeCliErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProductLinks(
  product: ProductLinkProductRecord,
  options: ProductLinkCheckerOptions,
): Array<{ linkKind: ProductLinkKindValue; url: string }> {
  const links: Array<{ linkKind: ProductLinkKindValue; url: string }> = [];

  if (options.kinds.includes(PRODUCT_LINK_KINDS.SOURCE)) {
    links.push({
      linkKind: PRODUCT_LINK_KINDS.SOURCE,
      url: createCoolpcPurchaseUrl(product.ibuyToken),
    });
  }

  return links;
}

function shouldCheckLink(
  url: string,
  existingHealth: ProductLinkHealthRecord | null,
  staleBefore: Date,
): boolean {
  return (
    !existingHealth ||
    existingHealth.url !== url ||
    existingHealth.checkedAt.getTime() <= staleBefore.getTime()
  );
}

function compareProductLinkCandidates(
  left: ProductLinkCandidate,
  right: ProductLinkCandidate,
): number {
  const priorityOrder = getCandidatePriority(left) - getCandidatePriority(right);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const checkedAtOrder = getCandidateCheckedAtTime(left) - getCandidateCheckedAtTime(right);

  if (checkedAtOrder !== 0) {
    return checkedAtOrder;
  }

  const kindOrder = left.linkKind.localeCompare(right.linkKind);

  if (kindOrder !== 0) {
    return kindOrder;
  }

  return left.productId.localeCompare(right.productId);
}

function getCandidatePriority(candidate: ProductLinkCandidate): number {
  if (!candidate.existingHealth || candidate.existingHealth.url !== candidate.url) {
    return 0;
  }

  return candidate.existingHealth.status === PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR ? 1 : 2;
}

function getCandidateCheckedAtTime(candidate: ProductLinkCandidate): number {
  return candidate.existingHealth?.checkedAt.getTime() ?? 0;
}

function formatCandidate(candidate: ProductLinkCandidate): string {
  return `${candidate.linkKind.toLowerCase()} | ${candidate.productId} | ${candidate.categoryLabel} | ${candidate.productName}`;
}

function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  return minDelayMs + Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
