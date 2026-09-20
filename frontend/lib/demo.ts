// Server-only support for the SIH demo sign-in. Everything is gated behind
// DEMO_MODE so a normal deployment never exposes the "Test the app" buttons or
// the auto sign-in route. Imported only from server code (the landing page is a
// Server Component and the route handler runs on the server), so reading these
// non-NEXT_PUBLIC vars here is safe and they never reach the browser bundle.

export type DemoRole = "tourist" | "operator";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * The two throwaway accounts, or null when demo mode is off or any credential is
 * missing. The route handler and the landing page both check this, so the feature
 * fails closed: no env, no entry point.
 */
export function demoCredentials(): Record<DemoRole, { email: string; password: string }> | null {
  if (!isDemoMode()) return null;

  const touristEmail = process.env.DEMO_TOURIST_EMAIL;
  const touristPassword = process.env.DEMO_TOURIST_PASSWORD;
  const operatorEmail = process.env.DEMO_OPERATOR_EMAIL;
  const operatorPassword = process.env.DEMO_OPERATOR_PASSWORD;

  if (!touristEmail || !touristPassword || !operatorEmail || !operatorPassword) return null;

  return {
    tourist: { email: touristEmail, password: touristPassword },
    operator: { email: operatorEmail, password: operatorPassword },
  };
}

export function isDemoRole(value: string | null | undefined): value is DemoRole {
  return value === "tourist" || value === "operator";
}
