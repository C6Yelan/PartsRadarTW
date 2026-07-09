// packages/shared/src/coolpc-source.ts
// 集中定義 CoolPC 來源識別、官方網址與跨 web / crawler 共用的 URL helper。

export const COOLPC_SOURCE_NAME = "coolpc";
export const COOLPC_OFFICIAL_HOSTNAME = "www.coolpc.com.tw";
export const COOLPC_OFFICIAL_BASE_URL = `https://${COOLPC_OFFICIAL_HOSTNAME}`;

// 建立 CoolPC 分類頁 URL，供 crawler 抓取與驗證流程共用。
export function createCoolpcCategoryUrl(
  igrp: number,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  const url = new URL("/eachview.php", baseUrl);
  url.searchParams.set("IGrp", String(igrp));

  return url.toString();
}

// 建立 CoolPC 使用者查看 / 購買 URL，供 public API 與維運檢查輸出共用。
export function createCoolpcPurchaseUrl(
  ibuyToken: string,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  const url = new URL("/evaluate.php", baseUrl);
  url.searchParams.set("iBuy", ibuyToken);

  return url.toString();
}

// 嚴格確認 base URL 是 canonical CoolPC origin，避免 live fetch 被導向其他 host 或路徑。
export function isOfficialCoolpcBaseUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname === COOLPC_OFFICIAL_HOSTNAME &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}
