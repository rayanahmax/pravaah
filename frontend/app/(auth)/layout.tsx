import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./auth.module.css";

/**
 * Shared shell for sign-in and sign-up.
 *
 * Both audiences pass through these forms now, so the brand is the product rather
 * than the department console, and the wordmark links back to the public landing
 * page instead of stranding someone inside the auth flow. The pages themselves are
 * client components and cannot export metadata, so the title is set here.
 */
export const metadata: Metadata = {
  title: "Access your account",
  description:
    "Sign in to PRAVAAH to request and track visitor permits, or to open the department operations console.",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <Link href="/" className={`auth-brand ${styles.brand}`}>
          <Image
            src="/logo.jpeg"
            width={40}
            height={40}
            alt="PRAVAAH emblem"
            className={styles.logo}
          />
          <span>
            <strong>PRAVAAH</strong>
            <small>Regulated visitor access</small>
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}
