/**
 * Where a browser session goes once it becomes authenticated.
 *
 * Sign-in and sign-up used to send everyone to `/overview`, which is the
 * department console. A tourist who got there was bounced to `/no-access` by
 * `requireOperator()`, so the first thing a visitor saw after registering was an
 * error page. This module asks the server which surface the session belongs to.
 *
 * It is a navigation hint, not an authorisation decision: the profile is read from
 * `/api/v1/auth/profile`, which derives the role from the `profiles` row under row
 * level security, and the console layout still calls `requireOperator()` on every
 * request. Sending a tourist to `/overview` by hand would change nothing about what
 * they can read or write (AGENTS.md rules 6-7).
 *
 * Client-safe by construction — it goes through `lib/client-api`, never the
 * Supabase service layer.
 */

import { apiGet } from "@/lib/client-api";

export const VISITOR_HOME = "/visitor";
export const OPERATOR_HOME = "/overview";

export function landingPathForRole(role: string | null | undefined): string {
  return role === "DEPARTMENT_OPERATOR" ? OPERATOR_HOME : VISITOR_HOME;
}

/**
 * Resolve the landing surface for the current session. Falls back to the visitor
 * home when the profile cannot be read: that is the surface that is safe to show
 * an unrecognised or profile-less account, and it links to sign-in and support
 * paths rather than failing closed on a blank screen.
 */
export async function resolveLandingPath(): Promise<string> {
  const result = await apiGet<{ role?: string }>("/api/v1/auth/profile");
  if (!result.ok) return VISITOR_HOME;
  return landingPathForRole(result.data.role);
}
