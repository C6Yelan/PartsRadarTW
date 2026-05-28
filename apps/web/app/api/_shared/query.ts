export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 24;
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

export class InvalidQueryError extends Error {
  constructor(
    public readonly parameter: string,
    reason: string,
  ) {
    super(`${parameter}: ${reason}`);
    this.name = "InvalidQueryError";
  }
}

export function getOptionalQueryValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);

  // Keep every query parameter single-valued so route handlers do not need to
  // guess how repeated user input should affect filtering or sorting.
  if (values.length > 1) {
    throw new InvalidQueryError(name, "must be provided only once");
  }

  const value = values[0]?.trim();
  return value ? value : undefined;
}

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

  // Require an explicit base-10 integer string before converting to Number.
  // Number() would otherwise accept forms like 1e2, 0x10, Infinity, or NaN.
  if (!DECIMAL_INTEGER_PATTERN.test(value)) {
    throw new InvalidQueryError(name, "must be a decimal integer");
  }

  const parsed = Number(value);

  // Keep the safe-integer guard after the format check to reject very large
  // decimal strings that cannot be represented precisely.
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

export function parseEnumQuery<TAllowed extends readonly [string, ...string[]]>(
  params: URLSearchParams,
  name: string,
  allowedValues: TAllowed,
  defaultValue: TAllowed[number],
): TAllowed[number] {
  const value = getOptionalQueryValue(params, name) ?? defaultValue;

  // Sort and status values must stay allowlisted; never pass arbitrary query
  // strings into Prisma orderBy fields or SQL fragments.
  if (!allowedValues.includes(value)) {
    throw new InvalidQueryError(name, "must be one of the allowed values");
  }

  return value;
}

export function parsePaginationQuery(params: URLSearchParams): PaginationQuery {
  // The pageSize cap is part of the API abuse boundary, not just a UI default.
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
