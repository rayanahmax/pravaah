import { NextResponse } from "next/server";
import type { DemoRole } from "@/lib/demo";
import { demoCredentials, isDemoRole } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

/**
 * Demo sign-in for the SIH evaluation build (no registration).
 *
 * A judge clicks a "Test the app" button on the landing page, which navigates to
 * this route with `?role=tourist|operator`. We sign that role's throwaway account
 * in server-side using credentials held only in the environment, let Supabase SSR
 * write the session cookie onto the response, then redirect to the surface the
 * role owns. The role never comes from the browser as a claim; it only selects
 * which server-held account to use, and the server-side guards on the target page
 * (requireAuth / requireOperator) still do the real checking.
 *
 * When DEMO_MODE is off or its env is incomplete this does nothing but send the
 * visitor to the normal login, so a real deployment is unaffected.
 */

const LANDING: Record<DemoRole, string> = {
  tourist: "/visitor",
  operator: "/overview",
};

// Always run at request time; never a build-time prerender (it reads env + sets cookies).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleParam = url.searchParams.get("role");
  const credentials = demoCredentials();

  if (!credentials || !isDemoRole(roleParam)) {
    return NextResponse.redirect(new URL("/login", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials[roleParam]);
  if (error) {
    // Do not surface the reason to a judge; fall back to the normal login.
    return NextResponse.redirect(new URL("/login", url));
  }

  return NextResponse.redirect(new URL(LANDING[roleParam], url));
}
