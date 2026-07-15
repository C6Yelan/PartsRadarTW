// apps/crawler/src/coolpc/vendor-classification.ts
// 管理 Coolpc 商品品牌分類規則，依 IGRP 取得候選品牌並從商品名稱推斷來源廠商。

export interface ProductVendorRule {
  // 單一品牌規則，包含品牌代號、顯示名稱與匹配關鍵字。
  slug: string;
  name: string;
  keywords: readonly string[];
}

export interface ProductVendorMatch {
  // 品牌匹配結果的最小資料。
  slug: string;
  name: string;
}

// 依 IGRP（商品分類）預置的品牌匹配規則表，供解析器進行前置判斷。
const PRODUCT_VENDOR_RULES_BY_IGRP: Record<number, readonly ProductVendorRule[]> = {
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
  8: [
    { slug: "toshiba", name: "Toshiba", keywords: ["Toshiba", "東芝"] },
    { slug: "wd", name: "WD", keywords: ["WD", "Western Digital"] },
    { slug: "seagate", name: "Seagate", keywords: ["Seagate", "希捷"] },
    { slug: "samsung", name: "三星", keywords: ["三星", "Samsung"] },
    { slug: "sandisk", name: "SanDisk", keywords: ["SanDisk", "Sandisk"] },
    { slug: "kingston", name: "金士頓", keywords: ["金士頓", "Kingston"] },
    { slug: "transcend", name: "創見", keywords: ["創見", "Transcend"] },
    { slug: "adata", name: "威剛", keywords: ["威剛", "ADATA", "XPG"] },
    { slug: "teamgroup", name: "十銓", keywords: ["十銓", "Team"] },
    { slug: "kioxia", name: "鎧俠", keywords: ["鎧俠", "Kioxia"] },
    { slug: "crucial", name: "美光", keywords: ["美光", "Crucial"] },
    { slug: "silicon-power", name: "廣穎", keywords: ["廣穎", "Silicon Power"] },
    { slug: "apacer", name: "宇瞻", keywords: ["宇瞻", "Apacer"] },
    { slug: "lexar", name: "Lexar", keywords: ["Lexar"] },
  ],
  9: [
    { slug: "kingston", name: "金士頓", keywords: ["金士頓", "Kingston"] },
    { slug: "gigastone", name: "GIGASTONE", keywords: ["GIGASTONE"] },
    { slug: "adata", name: "威剛", keywords: ["威剛", "ADATA", "XPG"] },
    { slug: "apacer", name: "宇瞻", keywords: ["宇瞻", "Apacer"] },
    { slug: "transcend", name: "創見", keywords: ["創見", "Transcend"] },
    { slug: "sandisk", name: "SanDisk", keywords: ["SanDisk", "Sandisk"] },
    { slug: "samsung", name: "三星", keywords: ["三星", "Samsung"] },
    { slug: "kioxia", name: "鎧俠", keywords: ["鎧俠", "Kioxia"] },
    { slug: "teamgroup", name: "十銓", keywords: ["十銓", "Team"] },
    { slug: "silicon-power", name: "廣穎", keywords: ["廣穎", "Silicon Power"] },
    { slug: "lexar", name: "Lexar", keywords: ["Lexar"] },
    { slug: "wd", name: "WD", keywords: ["WD", "Western Digital"] },
    { slug: "seagate", name: "Seagate", keywords: ["Seagate", "希捷"] },
    { slug: "toshiba", name: "Toshiba", keywords: ["Toshiba", "東芝"] },
    { slug: "crucial", name: "美光", keywords: ["美光", "Crucial", "Micron"] },
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
  11: [
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉", "GIGABYTE"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
    { slug: "deepcool", name: "九州風神", keywords: ["九州風神", "DEEPCOOL"] },
    { slug: "thermalright", name: "利民", keywords: ["利民", "Thermalright"] },
    { slug: "thermaltake", name: "曜越", keywords: ["曜越", "Thermaltake"] },
    { slug: "corsair", name: "海盜船", keywords: ["海盜船", "Corsair"] },
    { slug: "nzxt", name: "NZXT", keywords: ["NZXT"] },
    { slug: "silverstone", name: "銀欣", keywords: ["銀欣", "SilverStone"] },
    { slug: "lianli", name: "聯力", keywords: ["聯力", "Lian Li"] },
    { slug: "montech", name: "Montech", keywords: ["Montech"] },
    { slug: "antec", name: "Antec", keywords: ["Antec"] },
    { slug: "phanteks", name: "Phanteks", keywords: ["Phanteks"] },
    { slug: "id-cooling", name: "ID-COOLING", keywords: ["ID-COOLING"] },
    { slug: "enermax", name: "保銳", keywords: ["保銳", "ENERMAX"] },
    { slug: "darkflash", name: "darkFlash", keywords: ["darkFlash"] },
    { slug: "jonsbo", name: "喬思伯", keywords: ["喬思伯", "Jonsbo"] },
    { slug: "tryx", name: "TRYX", keywords: ["TRYX"] },
    { slug: "fractal", name: "Fractal", keywords: ["Fractal"] },
    { slug: "inwin", name: "迎廣", keywords: ["迎廣", "IN WIN"] },
    { slug: "sama", name: "SAMA", keywords: ["SAMA"] },
    { slug: "geometric-future", name: "幾何未來", keywords: ["幾何未來"] },
    { slug: "asrock", name: "華擎", keywords: ["華擎", "ASRock"] },
    { slug: "fsp", name: "全漢", keywords: ["全漢", "FSP"] },
    { slug: "xpg", name: "XPG", keywords: ["XPG"] },
    { slug: "cougar", name: "COUGAR", keywords: ["COUGAR"] },
    { slug: "apexgaming", name: "Apexgaming", keywords: ["Apexgaming"] },
    { slug: "cryorig", name: "快睿", keywords: ["快睿", "Cryorig"] },
    { slug: "tcomas", name: "鈦鉭", keywords: ["鈦鉭", "TCOMAS"] },
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
  16: [
    { slug: "delta", name: "台達", keywords: ["台達", "Delta"] },
    { slug: "acer", name: "宏碁", keywords: ["宏碁", "Acer", "ACER"] },
    { slug: "msi", name: "微星", keywords: ["微星", "MSI"] },
    { slug: "thermalright", name: "利民", keywords: ["利民", "Thermalright"] },
    { slug: "coolermaster", name: "酷碼", keywords: ["酷碼", "Cooler Master"] },
    { slug: "noctua", name: "貓頭鷹", keywords: ["貓頭鷹", "Noctua"] },
    { slug: "jonsbo", name: "喬思伯", keywords: ["喬思伯", "Jonsbo"] },
    { slug: "deepcool", name: "九州風神", keywords: ["九州風神", "DEEPCOOL"] },
    { slug: "scythe", name: "Scythe", keywords: ["Scythe"] },
    { slug: "id-cooling", name: "ID-COOLING", keywords: ["ID-COOLING"] },
    { slug: "silverstone", name: "銀欣", keywords: ["銀欣", "SilverStone"] },
    { slug: "montech", name: "Montech", keywords: ["Montech"] },
    { slug: "enermax", name: "保銳", keywords: ["保銳", "ENERMAX"] },
    { slug: "adata", name: "威剛", keywords: ["威剛", "ADATA"] },
    { slug: "xpg", name: "XPG", keywords: ["XPG"] },
    { slug: "darkflash", name: "darkFlash", keywords: ["darkFlash"] },
    { slug: "asus", name: "華碩", keywords: ["華碩", "ASUS"] },
    { slug: "cougar", name: "COUGAR", keywords: ["COUGAR"] },
    { slug: "thermaltake", name: "曜越", keywords: ["曜越", "Thermaltake"] },
    { slug: "lianli", name: "聯力", keywords: ["聯力", "Lian Li"] },
    { slug: "phanteks", name: "Phanteks", keywords: ["Phanteks"] },
    { slug: "fractal", name: "Fractal", keywords: ["Fractal"] },
    { slug: "nzxt", name: "NZXT", keywords: ["NZXT"] },
    { slug: "antec", name: "Antec", keywords: ["Antec"] },
    { slug: "fsp", name: "全漢", keywords: ["全漢", "FSP"] },
    { slug: "gigabyte", name: "技嘉", keywords: ["技嘉"] },
    { slug: "sama", name: "SAMA", keywords: ["SAMA"] },
    { slug: "arctic", name: "ARCTIC", keywords: ["ARCTIC"] },
    { slug: "be-quiet", name: "be quiet!", keywords: ["be quiet!"] },
    { slug: "inwin", name: "迎廣", keywords: ["迎廣", "IN WIN"] },
    { slug: "corsair", name: "海盜船", keywords: ["海盜船", "Corsair"] },
    { slug: "superflower", name: "振華", keywords: ["振華", "Super Flower"] },
    { slug: "icooltw", name: "i-CoolTw", keywords: ["i-CoolTw"] },
    { slug: "apexgaming", name: "Apexgaming", keywords: ["Apexgaming"] },
    { slug: "bitfenix", name: "BitFenix", keywords: ["BitFenix"] },
    { slug: "sharkoon", name: "旋剛", keywords: ["旋剛", "Sharkoon"] },
    { slug: "mavoly", name: "Mavoly", keywords: ["Mavoly"] },
  ],
};

function getProductVendorRules(
  igrp: number | string | null | undefined,
): readonly ProductVendorRule[] {
  // 先將 IGRP 正規化；無效輸入直接回空清單，避免無效規則查詢。
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
  // 先清除來源標籤再做品牌匹配；未匹配到則回傳 null。
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
  // 將 IGRP 轉成純數字；非法或空值直接回傳 null，避免無效 lookup。
  if (typeof igrp === "number") {
    return Number.isInteger(igrp) ? igrp : null;
  }

  if (!igrp || !/^\d+$/.test(igrp)) {
    return null;
  }

  return Number(igrp);
}

function stripLeadingSourceLabels(value: string): string {
  // 移除商品名稱前綴的來源標籤（如 [活動]、【門市限定】），避免前綴干擾品牌判斷。
  return value.replace(/^(\s*(?:\[[^\]]+\]|【[^】]+】)\s*)+/u, "").trim();
}

function normalizeProductVendorText(value: string): string {
  // 將空白壓縮、去首尾空白，並轉小寫，提供穩定的品牌關鍵字比對字串。
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("zh-TW");
}
