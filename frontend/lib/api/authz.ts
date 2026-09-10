import type { NextResponse } from "next/server";
import { getProfile, type Profile } from "@/lib/auth";
import { apiError } from "@/lib/api/error";

/**
 * Server-side authorization for API routes.
 *
 * The role always comes from the profiles row read through PostgREST under row
 * level security, never from a request body, header, or cookie value the caller
 * controls (AGENTS.md rules 6 and 7). RLS is still the final gate on the write
 * itself; this check exists so the API returns a clear 403 instead of an opaque
 * empty result.
 */
export type Authorized<T> = { profile: T } | { response: NextResponse };

export async function requireOperator(): Promise<Authorized<Profile>> {
  const profile = await getProfile();

  if (!profile) {
    return { response: apiError("UNAUTHORIZED", "Sign in is required for this operation.") };
  }
  if (profile.role !== "DEPARTMENT_OPERATOR") {
    return { response: apiError("FORBIDDEN", "This operation requires the department operator role.") };
  }

  return { profile };
}
