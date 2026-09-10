import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for server-side code (Server Components, Route Handlers,
 * Server Actions). Uses the anon key by default; pass `true` for serviceRole
 * to get elevated privileges — but ONLY in server-side business logic that
 * must bypass RLS (e.g. occupancy transactions).
 */
export async function createClient(serviceRole = false) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from Server Components where cookies cannot
            // be modified. This can be ignored when the middleware refreshes
            // the session.
          }
        },
      },
    }
  );
}
