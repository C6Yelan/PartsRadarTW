// 合併本地解析與來源篩選標籤，集中處理已知的來源分類衝突。

import { getProductFacetDefinitions } from "./registry";

export function mergeProductFilterTags(
  igrp: number,
  localTags: readonly string[],
  sourceTags: readonly string[],
): string[] {
  const protectedLocalFacetKeys = new Set<string>();
  if (igrp === 5 && localTags.includes("socket:swrx8")) {
    protectedLocalFacetKeys.add("socket");
  }
  if (igrp === 8 && localTags.includes("storage_usage:laptop")) {
    protectedLocalFacetKeys.add("storage_usage");
  }
  const effectiveSourceTags = sourceTags.filter(
    (tag) => !protectedLocalFacetKeys.has(readFacetKey(tag)),
  );
  const sourceFacetKeys = new Set(effectiveSourceTags.map(readFacetKey));
  const selected = new Set([
    ...localTags.filter((tag) => !sourceFacetKeys.has(readFacetKey(tag))),
    ...effectiveSourceTags,
  ]);

  return getProductFacetDefinitions(igrp).flatMap((definition) =>
    definition.options
      .map((candidate) => `${definition.key}:${candidate.value}`)
      .filter((tag) => selected.has(tag)),
  );
}

function readFacetKey(tag: string): string {
  return tag.slice(0, tag.indexOf(":"));
}
