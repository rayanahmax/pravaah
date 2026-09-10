import { NextResponse } from "next/server";

/**
 * Response helpers for the single error envelope defined in docs/API.md:
 *
 *   { "error": { "code": "CAPACITY_EXCEEDED", "message": "..." } }
 *
 * Success is always { "data": ... }. Codes are constrained so clients can branch
 * on them without parsing prose, and so no internal database detail can leak
 * (API rule 3: do not expose database internals).
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CAPACITY_EXCEEDED"
  | "QUOTA_EXCEEDED"
  | "INVALID_STATE"
  | "CONFLICT"
  | "DATABASE_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CAPACITY_EXCEEDED: 409,
  QUOTA_EXCEEDED: 409,
  INVALID_STATE: 409,
  CONFLICT: 409,
  DATABASE_ERROR: 500,
};

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS_BY_CODE[code] });
}

/**
 * Database errors are logged in full server-side but reported generically, so a
 * constraint name or schema detail never reaches the client.
 */
export function apiDatabaseError(context: string, detail?: unknown): NextResponse {
  console.error(`[API] ${context}:`, detail);
  return apiError(
    "DATABASE_ERROR",
    "The request could not be completed. Please try again."
  );
}

export function apiData<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}
