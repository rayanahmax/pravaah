import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session cookie only when it actually needs refreshing.
  //
  // getUser() calls the Supabase auth server on EVERY matched request — a full
  // network round-trip that ran on every navigation and every <Link> prefetch,
  // which is the main reason page changes felt slow. getSession() reads the
  // session from the request cookies and only reaches the network when the
  // access token is expired and must be renewed, so the common case is local.
  // Route protection is unaffected: the pages that need an identity still call
  // getUser()/getProfile() themselves, which validate against the server.
  await supabase.auth.getSession();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico, public files
     * - api/v1/* (handled by route handlers)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
