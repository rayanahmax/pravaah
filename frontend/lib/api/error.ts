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
  | "DATE_IN_PAST"
  | "GROUP_SIZE_INVALID"
  | "DESTINATION_CLOSED"
  | "DESTINATION_RESTRICTED"
  | "NOT_CONFIGURED"
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
  DATE_IN_PAST: 400,
  GROUP_SIZE_INVALID: 400,
  DESTINATION_CLOSED: 409,
  DESTINATION_RESTRICTED: 409,
  NOT_CONFIGURED: 409,
  DATABASE_ERROR: 500,
};

/** Codes the pure permit rules may return; they are already API codes. */
const RULE_CODES = new Set<string>([
  "DATE_IN_PAST",
  "GROUP_SIZE_INVALID",
  "DESTINATION_CLOSED",
  "DESTINATION_RESTRICTED",
  "CAPACITY_EXCEEDED",
  "QUOTA_EXCEEDED",
  "NOT_CONFIGURED",
  "INVALID_STATE",
  "NOT_FOUND",
  "FORBIDDEN",
  "VALIDATION_ERROR",
]);

/**
 * Turns a lib/permit-rules rejection into a response. An unrecognised code is
 * reported as a plain validation failure rather than echoed back, so a client
 * cannot see codes the contract never defines.
 */
export function apiRejection(rejection: { code: string; message: string }): NextResponse {
  const code = RULE_CODES.has(rejection.code) ? (rejection.code as ApiErrorCode) : "INVALID_STATE";
  return apiError(code, rejection.message);
}

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
