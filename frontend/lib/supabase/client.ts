"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components only.
 * Uses the anon key — never the service-role key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
