/**
 * Browser-side helper for calling the versioned API.
 *
 * The route handlers are the only place capacity, quota, permit state and
 * check-in/check-out are decided (AGENTS.md rules 6-7), so the console never
 * talks to Supabase directly from the client. It posts to `/api/v1/...`, and the
 * same request-scoped cookies authenticate the call. This module only understands
 * the response envelope ({ data } on success, { error: { code, message } } on a
 * refusal) and hands back a discriminated result; it adds no authority of its
 * own.
 *
 * Client-safe by construction: no server-only imports, nothing from the Supabase
 * service layer.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const FALLBACK = "The request could not be completed. Please try again.";

async function request<T>(method: "GET" | "POST" | "PATCH", url: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Network error. Check the connection and retry." };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const envelope = (payload ?? {}) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (response.ok) {
    if (envelope.data === undefined) {
      return { ok: false, code: "UNEXPECTED_RESPONSE", message: FALLBACK };
    }
    return { ok: true, data: envelope.data };
  }

  return {
    ok: false,
    code: envelope.error?.code ?? "UNKNOWN",
    message: envelope.error?.message ?? FALLBACK,
  };
}

export const apiGet = <T>(url: string) => request<T>("GET", url);
export const apiPost = <T>(url: string, body?: unknown) => request<T>("POST", url, body);
export const apiPatch = <T>(url: string, body: unknown) => request<T>("PATCH", url, body);
