// apps/web/app/api/_shared/query.ts
// 提供 web API route 共用的 query 解析規則，集中維持單值參數、型別檢查與分頁上限。

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

const DECIMAL_INTEGER_PATTERN = /^-?\d+$/;

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface IntegerQueryOptions {
  min?: number;
  max?: number;
  defaultValue?: number;
}

export interface TextQueryOptions {
  maxLength: number;
  defaultValue?: string;
}

// 標示 API query 驗證失敗，讓 route handler 能統一回應 invalid query 而不暴露內部錯誤。
export class InvalidQueryError extends Error {
  constructor(
    public readonly parameter: string,
    reason: string,
  ) {
    super(`${parameter}: ${reason}`);
    this.name = "InvalidQueryError";
  }
}

// 讀取單值 query 參數；重複參數一律視為錯誤，避免篩選與排序語意不明。
export function getOptionalQueryValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);

  if (values.length > 1) {
    throw new InvalidQueryError(name, "must be provided only once");
  }

  const value = values[0]?.trim();
  return value ? value : undefined;
}

// 解析可選文字 query，負責套用 trim、空值處理與長度上限。
export function parseOptionalTextQuery(
  params: URLSearchParams,
  name: string,
  options: TextQueryOptions,
): string | undefined {
  const value = getOptionalQueryValue(params, name) ?? options.defaultValue;

  if (!value) {
    return undefined;
  }

  if (value.length > options.maxLength) {
    throw new InvalidQueryError(name, `must be ${options.maxLength} characters or fewer`);
  }

  return value;
}

// 解析可選整數 query；只接受明確十進位整數，並區分缺省值與空字串錯誤。
export function parseOptionalIntegerQuery(
  params: URLSearchParams,
  name: string,
  options: IntegerQueryOptions = {},
): number | undefined {
  const values = params.getAll(name);

  if (values.length > 1) {
    throw new InvalidQueryError(name, "must be provided only once");
  }

  if (values.length === 0) {
    return options.defaultValue;
  }

  const value = values[0]?.trim() ?? "";

  if (!DECIMAL_INTEGER_PATTERN.test(value)) {
    throw new InvalidQueryError(name, "must be a decimal integer");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidQueryError(name, "must be an integer");
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new InvalidQueryError(name, `must be greater than or equal to ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new InvalidQueryError(name, `must be less than or equal to ${options.max}`);
  }

  return parsed;
}

// 解析 allowlist query，例如 sort 或 status，避免任意字串流入查詢排序或狀態條件。
export function parseEnumQuery<TAllowed extends readonly [string, ...string[]]>(
  params: URLSearchParams,
  name: string,
  allowedValues: TAllowed,
  defaultValue: TAllowed[number],
): TAllowed[number] {
  const value = getOptionalQueryValue(params, name) ?? defaultValue;

  if (!allowedValues.includes(value)) {
    throw new InvalidQueryError(name, "must be one of the allowed values");
  }

  return value;
}

// 解析列表分頁 query；pageSize 上限是 public API 的濫用邊界，不只是前端顯示偏好。
export function parsePaginationQuery(params: URLSearchParams): PaginationQuery {
  return {
    page:
      parseOptionalIntegerQuery(params, "page", {
        defaultValue: DEFAULT_PAGE,
        min: 1,
      }) ?? DEFAULT_PAGE,
    pageSize:
      parseOptionalIntegerQuery(params, "pageSize", {
        defaultValue: DEFAULT_PAGE_SIZE,
        min: 1,
        max: MAX_PAGE_SIZE,
      }) ?? DEFAULT_PAGE_SIZE,
  };
}
