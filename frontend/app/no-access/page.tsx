import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Access restricted" };

/**
 * Landing point for authenticated accounts whose role is not DEPARTMENT_OPERATOR.
 * It sits outside the (department) route group on purpose: the console layout
 * calls requireOperator(), so redirecting a non-operator into that group would
 * loop. This page is reachable without operator rights.
 *
 * For a tourist it also points them back to their own area — a visitor browses
 * destinations and shows their QR pass; the checkpoint scanner is a staff tool,
 * not something a visitor uses.
 */
export default async function NoAccessPage() {
  const profile = await requireAuth();
  const isTourist = profile.role === "TOURIST";

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand__mark">
            <ShieldAlert aria-hidden="true" size={22} />
          </span>
          <div>
            <strong>PRAVAAH</strong>
            <small>Access restricted</small>
          </div>
        </div>

        <h1>Department console unavailable</h1>
        <p className="page-header__description">
          You are signed in as {profile.full_name || profile.id} with the role{" "}
          <strong>{profile.role}</strong>. The operations console and the checkpoint
          scanner are for department staff only.
        </p>

        {isTourist ? (
          <p className="auth-notice">
            As a visitor, your home is the visitor area: browse destinations, request a permit and
            show your QR pass there. The links below take you back to it.
          </p>
        ) : null}

        <p className="auth-footer">
          {isTourist ? (
            <>
              <Link href="/visitor">Visitor home</Link>
              {" · "}
              <Link href="/destinations">Browse destinations</Link>
              {" · "}
              <Link href="/my-permits">My permits</Link>
              {" · "}
            </>
          ) : null}
          <Link href="/login">Switch account</Link>
        </p>
      </div>
    </div>
  );
}
