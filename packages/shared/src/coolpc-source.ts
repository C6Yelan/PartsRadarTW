export const COOLPC_SOURCE_NAME = "coolpc";
export const COOLPC_OFFICIAL_HOSTNAME = "www.coolpc.com.tw";
export const COOLPC_OFFICIAL_BASE_URL = `https://${COOLPC_OFFICIAL_HOSTNAME}`;

export function createCoolpcCategoryUrl(
  igrp: number,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  const url = new URL("/eachview.php", baseUrl);
  url.searchParams.set("IGrp", String(igrp));

  return url.toString();
}

export function createCoolpcPurchaseUrl(
  ibuyToken: string,
  baseUrl = COOLPC_OFFICIAL_BASE_URL,
): string {
  const url = new URL("/evaluate.php", baseUrl);
  url.searchParams.set("iBuy", ibuyToken);

  return url.toString();
}

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
