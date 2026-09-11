import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { TouristHeaderNav, TouristMobileNav } from "./tourist-nav";
import "../tourist-motion.css";
import styles from "./tourist-shell.module.css";

/**
 * Tourist-facing shell (Phase 13).
 *
 * Deliberately PUBLIC: no auth guard here, because destination information is
 * public and a visitor should be able to browse before signing in. The pages that
 * actually need an identity — requesting a permit, viewing "my permits", the QR —
 * call requireAuth themselves. This keeps the auth boundary per-route rather than
 * a blanket redirect that would lock tourists out of discovery.
 *
 * The header/footer are foundation-owned; the three workstreams fill the content
 * area between them and never edit this shell.
 */
export default async function TouristLayout({ children }: { children: ReactNode }) {
  const user = await getUser();

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/visitor" className={styles.brand}>
            <Image
              src="/logo.jpeg"
              width={38}
              height={38}
              alt="PRAVAAH emblem"
              className={styles.brandLogo}
            />
            <span className={styles.brandText}>
              <strong>PRAVAAH</strong>
              <small>Visitor access</small>
            </span>
          </Link>

          <TouristHeaderNav />

          <div className={styles.auth}>
            {user ? (
              <Link href="/logout" className={styles.ghost}>
                Sign out
              </Link>
            ) : (
              <>
                <Link href="/login" className={styles.ghost}>
                  Sign in
                </Link>
                <Link href="/register" className={styles.cta}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>PRAVAAH — regulated visitor access</span>
          <span className={styles.footNote}>
            Capacity and permits are decided by the department. Weather and readiness guidance
            arrive with later phases.
          </span>
        </div>
      </footer>

      <TouristMobileNav />
    </div>
  );
}
