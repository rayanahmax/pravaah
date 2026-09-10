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
 */
export default async function NoAccessPage() {
  const profile = await requireAuth();

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
          <strong>{profile.role}</strong>. The operations console is limited to
          department operator accounts. Ask an administrator to grant your
          account the DEPARTMENT_OPERATOR role.
        </p>

        <p className="auth-footer">
          <Link href="/login">Switch account</Link>
        </p>
      </div>
    </div>
  );
}
