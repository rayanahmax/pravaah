import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileRole = "TOURIST" | "DEPARTMENT_OPERATOR";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
};

/**
 * Get the authenticated user from Supabase Auth.
 * Returns null if not authenticated.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the authenticated user's profile from the profiles table.
 * Returns null if not authenticated or no profile exists.
 */
export async function getProfile(): Promise<Profile | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();

  // maybeSingle, not single: a missing profile is a valid state (it is created by
  // the on-user-created trigger in migration 003). .single() turns zero rows into
  // PostgREST error PGRST116, which previously hid the real problem in noise.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (error) {
    console.error("[AUTH] Profile query error:", error.message, error.code);
    return null;
  }

  if (!data) {
    console.error("[AUTH] No profile row for authenticated user:", user.id);
  }

  return data;
}

/**
 * Require an authenticated user. Redirects to /login if not signed in,
 * or if the account has no profile. Returns the user profile.
 */
export async function requireAuth(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login");
  }
  return profile;
}

/**
 * Require a DEPARTMENT_OPERATOR. Signed-in accounts without that role are sent to
 * /no-access, which is outside the (department) route group, so this cannot
 * redirect back into a page that calls requireOperator again.
 */
export async function requireOperator(): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role !== "DEPARTMENT_OPERATOR") {
    redirect("/no-access");
  }
  return profile;
}
