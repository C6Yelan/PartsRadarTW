export interface ProductVendorRule {
  slug: string;
  name: string;
  keywords: readonly string[];
}

export interface ProductVendorMatch {
  slug: string;
  name: string;
}

export const PRODUCT_VENDOR_RULES_BY_IGRP: Record<number, readonly ProductVendorRule[]> = {
  4: [
    { slug: "amd", name: "AMD", keywords: ["AMD"] },
    { slug: "intel", name: "Intel", keywords: ["Intel"] },
  ],
  5: [
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉"] },
    { slug: "asrock", name: "華擎", keywords: ["華擎", "ASRock"] },
  ],
  6: [
    { slug: "adata", name: "威剛", keywords: ["威剛", "ADATA", "XPG"] },
    { slug: "kingston", name: "金士頓", keywords: ["金士頓", "Kingston"] },
    { slug: "gskill", name: "芝奇", keywords: ["芝奇", "G.SKILL"] },
    { slug: "umax", name: "UMAX", keywords: ["UMAX"] },
    { slug: "crucial", name: "美光", keywords: ["美光", "Crucial"] },
    { slug: "klevv", name: "KLEVV", keywords: ["KLEVV"] },
    { slug: "corsair", name: "海盜船", keywords: ["海盜船", "Corsair"] },
    { slug: "acer", name: "宏碁", keywords: ["宏碁", "Acer", "ACER"] },
    { slug: "biwin", name: "Biwin", keywords: ["Biwin"] },
    { slug: "teamgroup", name: "十銓", keywords: ["十銓", "Team"] },
    { slug: "origin-code", name: "Origin code", keywords: ["Origin code"] },
  ],
  7: [
    { slug: "crucial", name: "美光", keywords: ["美光", "Crucial"] },
    { slug: "kingston", name: "金士頓", keywords: ["金士頓", "Kingston"] },
    { slug: "samsung", name: "三星", keywords: ["三星", "Samsung"] },
    { slug: "acer", name: "宏碁", keywords: ["宏碁", "Acer", "ACER"] },
    { slug: "adata", name: "威剛", keywords: ["威剛", "ADATA", "XPG"] },
    { slug: "corsair", name: "海盜船", keywords: ["海盜船", "Corsair"] },
    { slug: "zhitai", name: "致態", keywords: ["致態", "ZhiTai"] },
    { slug: "biwin", name: "Biwin", keywords: ["Biwin"] },
    { slug: "teamgroup", name: "十銓", keywords: ["十銓", "Team"] },
    { slug: "wd", name: "WD", keywords: ["WD", "Western Digital"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "kioxia", name: "鎧俠", keywords: ["鎧俠", "Kioxia"] },
    { slug: "klevv", name: "KLEVV", keywords: ["KLEVV"] },
    { slug: "umax", name: "UMAX", keywords: ["UMAX"] },
  ],
  10: [
    { slug: "thermalright", name: "利民", keywords: ["利民", "Thermalright"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
    { slug: "noctua", name: "貓頭鷹", keywords: ["貓頭鷹", "Noctua"] },
    { slug: "jonsbo", name: "喬思伯", keywords: ["喬思伯", "Jonsbo"] },
    { slug: "deepcool", name: "九州風神", keywords: ["九州風神", "DEEPCOOL"] },
    { slug: "scythe", name: "Scythe", keywords: ["Scythe"] },
    { slug: "id-cooling", name: "ID-COOLING", keywords: ["ID-COOLING"] },
    { slug: "cryorig", name: "快睿", keywords: ["快睿", "Cryorig"] },
    { slug: "fsp", name: "全漢", keywords: ["全漢", "FSP"] },
    { slug: "silverstone", name: "銀欣", keywords: ["銀欣", "SilverStone"] },
    { slug: "montech", name: "Montech", keywords: ["Montech"] },
    { slug: "sama", name: "SAMA", keywords: ["SAMA"] },
    { slug: "enermax", name: "保銳", keywords: ["保銳", "ENERMAX"] },
    { slug: "xpg", name: "XPG", keywords: ["XPG"] },
    { slug: "darkflash", name: "darkFlash", keywords: ["darkFlash"] },
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "cougar", name: "COUGAR", keywords: ["COUGAR"] },
    { slug: "raymii", name: "Raymii", keywords: ["Raymii"] },
    { slug: "tryx", name: "TRYX", keywords: ["TRYX"] },
    { slug: "superflower", name: "振華", keywords: ["振華", "Super Flower"] },
  ],
  12: [
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "zotac", name: "ZOTAC", keywords: ["ZOTAC"] },
    { slug: "inno3d", name: "INNO3D", keywords: ["INNO3D"] },
    { slug: "sapphire", name: "藍寶石", keywords: ["藍寶石", "Sapphire"] },
    { slug: "asrock", name: "華擎", keywords: ["華擎", "ASRock"] },
    { slug: "powercolor", name: "撼訊", keywords: ["撼訊", "PowerColor"] },
    { slug: "leadtek", name: "麗臺", keywords: ["麗臺", "Leadtek"] },
    { slug: "acer", name: "宏碁", keywords: ["宏碁", "Acer", "ACER"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
  ],
  14: [
    { slug: "firstplayer", name: "1st Player", keywords: ["1st Player"] },
    { slug: "apexgaming", name: "Apexgaming", keywords: ["Apexgaming"] },
    { slug: "bitfenix", name: "BitFenix", keywords: ["BitFenix"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
    { slug: "montech", name: "Montech", keywords: ["Montech"] },
    { slug: "fractal", name: "Fractal", keywords: ["Fractal"] },
    { slug: "jonsbo", name: "喬思伯", keywords: ["喬思伯", "Jonsbo"] },
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "antec", name: "Antec", keywords: ["Antec"] },
    { slug: "cougar", name: "COUGAR", keywords: ["COUGAR"] },
    { slug: "thermaltake", name: "曜越", keywords: ["曜越", "Thermaltake"] },
    { slug: "silverstone", name: "銀欣", keywords: ["銀欣", "SilverStone"] },
    { slug: "phanteks", name: "Phanteks", keywords: ["Phanteks"] },
    { slug: "lianli", name: "聯力", keywords: ["聯力", "Lian Li"] },
    { slug: "superchannel", name: "視博通", keywords: ["視博通"] },
    { slug: "darkflash", name: "darkFlash", keywords: ["darkFlash"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "inwin", name: "迎廣", keywords: ["迎廣", "IN WIN"] },
    { slug: "fsp", name: "全漢", keywords: ["全漢", "FSP"] },
    { slug: "sharkoon", name: "旋剛", keywords: ["旋剛", "Sharkoon"] },
    { slug: "nzxt", name: "NZXT", keywords: ["NZXT"] },
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉"] },
    { slug: "sama", name: "SAMA", keywords: ["SAMA"] },
    { slug: "deepcool", name: "DEEPCOOL", keywords: ["DEEPCOOL", "九州風神"] },
    { slug: "hyte", name: "HYTE", keywords: ["HYTE"] },
    { slug: "mavoly", name: "Mavoly", keywords: ["Mavoly"] },
    { slug: "tryx", name: "TRYX", keywords: ["TRYX"] },
    { slug: "xpg", name: "XPG", keywords: ["XPG"] },
    { slug: "enermax", name: "保銳", keywords: ["保銳", "ENERMAX"] },
    { slug: "superflower", name: "振華", keywords: ["振華", "Super Flower"] },
    { slug: "geometric-future", name: "幾何未來", keywords: ["幾何未來"] },
    { slug: "shuchang", name: "樹昌", keywords: ["樹昌"] },
    { slug: "yashuo", name: "亞碩", keywords: ["亞碩"] },
  ],
  15: [
    { slug: "bitfenix", name: "BitFenix", keywords: ["BitFenix"] },
    { slug: "fsp", name: "全漢", keywords: ["全漢", "FSP"] },
    { slug: "seasonic", name: "海韻", keywords: ["海韻", "Seasonic"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "superflower", name: "振華", keywords: ["振華", "Super Flower"] },
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "apexgaming", name: "Apexgaming", keywords: ["Apexgaming"] },
    { slug: "montech", name: "Montech", keywords: ["Montech"] },
    { slug: "enermax", name: "保銳", keywords: ["保銳", "ENERMAX"] },
    { slug: "antec", name: "Antec", keywords: ["Antec"] },
    { slug: "silverstone", name: "銀欣", keywords: ["銀欣", "SilverStone"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
    { slug: "xpg", name: "XPG", keywords: ["XPG"] },
    { slug: "cougar", name: "COUGAR", keywords: ["COUGAR"] },
    { slug: "deepcool", name: "九州風神", keywords: ["九州風神", "DEEPCOOL"] },
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉"] },
    { slug: "nzxt", name: "NZXT", keywords: ["NZXT"] },
    { slug: "asrock", name: "ASRock", keywords: ["ASRock", "華擎"] },
    { slug: "delta", name: "台達", keywords: ["台達", "Delta"] },
    { slug: "thermaltake", name: "曜越", keywords: ["曜越", "Thermaltake"] },
    { slug: "darkflash", name: "darkFlash", keywords: ["darkFlash"] },
    { slug: "thermalright", name: "利民", keywords: ["利民", "Thermalright"] },
    { slug: "lianli", name: "聯力", keywords: ["聯力", "Lian Li"] },
  ],
};

export function getProductVendorRules(
  igrp: number | string | null | undefined,
): readonly ProductVendorRule[] {
  const normalizedIgrp = normalizeIgrp(igrp);

  if (normalizedIgrp === null) {
    return [];
  }

  return PRODUCT_VENDOR_RULES_BY_IGRP[normalizedIgrp] ?? [];
}

export function classifyProductVendor(
  igrp: number | string | null | undefined,
  productName: string,
): ProductVendorMatch | null {
  const normalizedName = normalizeProductVendorText(stripLeadingSourceLabels(productName));

  if (!normalizedName) {
    return null;
  }

  for (const rule of getProductVendorRules(igrp)) {
    if (
      rule.keywords.some((keyword) =>
        normalizedName.startsWith(normalizeProductVendorText(keyword)),
      )
    ) {
      return { slug: rule.slug, name: rule.name };
    }
  }

  return null;
}

function normalizeIgrp(igrp: number | string | null | undefined): number | null {
  if (typeof igrp === "number") {
    return Number.isInteger(igrp) ? igrp : null;
  }

  if (!igrp || !/^\d+$/.test(igrp)) {
    return null;
  }

  return Number(igrp);
}

function stripLeadingSourceLabels(value: string): string {
  return value.replace(/^(\s*(?:\[[^\]]+\]|【[^】]+】)\s*)+/u, "").trim();
}

function normalizeProductVendorText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("zh-TW");
}
