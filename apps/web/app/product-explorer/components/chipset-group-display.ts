// 將 shared facet 的晶片組 group 名稱轉成前端群組標題所需的顯示資料。

export interface ChipsetGroupDisplay {
  vendor: "intel" | "amd" | "unknown";
  vendorLabel: string;
  platformLabel: string;
  originalGroup: string;
}

export function parseChipsetGroupDisplay(group: string): ChipsetGroupDisplay {
  if (group.startsWith("Intel ")) {
    return {
      vendor: "intel",
      vendorLabel: "Intel",
      platformLabel: group.slice("Intel ".length),
      originalGroup: group,
    };
  }

  if (group.startsWith("AMD ")) {
    return {
      vendor: "amd",
      vendorLabel: "AMD",
      platformLabel: group.slice("AMD ".length),
      originalGroup: group,
    };
  }

  if (group === "Threadripper") {
    return {
      vendor: "amd",
      vendorLabel: "AMD",
      platformLabel: group,
      originalGroup: group,
    };
  }

  return {
    vendor: "unknown",
    vendorLabel: "",
    platformLabel: group,
    originalGroup: group,
  };
}

export function shouldShowChipsetVendorHeading(
  group: string,
  previousGroup: string | null,
): boolean {
  const currentVendor = parseChipsetGroupDisplay(group).vendor;
  const previousVendor = previousGroup
    ? parseChipsetGroupDisplay(previousGroup).vendor
    : "unknown";

  return currentVendor !== "unknown" && currentVendor !== previousVendor;
}
