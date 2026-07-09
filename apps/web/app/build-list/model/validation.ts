// apps/web/app/build-list/model/validation.ts
// 提供配單 localStorage 資料正規化用的基礎驗證 helper，避免未知 JSON 直接進入配單模型。

// 判斷未知值是否為可讀取欄位的純物件，作為 persisted data 正規化入口。
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 將未知值收斂成非空字串；空白字串視為無效欄位。
export function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

// 將未知值收斂成 number；非 number 交由呼叫端用 NaN 判斷是否有效。
export function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number.NaN;
}

// 將 persisted ISO 日期字串標準化，無效日期回傳 null 讓呼叫端決定 fallback。
export function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// 只接受 HTTP(S) URL，避免配單來源連結保存 javascript: 等不安全 scheme。
export function toHttpUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  try {
    const url = new URL(trimmedValue);

    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// 接受站內圖片路徑或 HTTP(S) 圖片 URL，並擋下 protocol-relative URL。
export function toImageUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.startsWith("/") && !trimmedValue.startsWith("//")) {
    return trimmedValue;
  }

  return toHttpUrl(trimmedValue);
}
