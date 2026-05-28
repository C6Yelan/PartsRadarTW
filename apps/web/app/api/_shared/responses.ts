export const API_ERROR_MESSAGES = {
  // Public API errors stay generic so Prisma, DB, crawler, and environment
  // details cannot leak through route handler exceptions.
  invalidQuery: "Invalid query parameter.",
  notFound: "Resource not found.",
  internalError: "Internal server error.",
} as const;

export type ApiErrorCode = "invalid_query" | "not_found" | "internal_error";

export interface ApiErrorResponseBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export function jsonOk<TBody>(body: TBody, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    status: init?.status ?? 200,
  });
}

function jsonError(status: 400 | 404 | 500, code: ApiErrorCode, message: string): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    } satisfies ApiErrorResponseBody,
    { status },
  );
}

export function invalidQueryResponse(): Response {
  return jsonError(400, "invalid_query", API_ERROR_MESSAGES.invalidQuery);
}

export function notFoundResponse(): Response {
  return jsonError(404, "not_found", API_ERROR_MESSAGES.notFound);
}

export function internalErrorResponse(): Response {
  return jsonError(500, "internal_error", API_ERROR_MESSAGES.internalError);
}
