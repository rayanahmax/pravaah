"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isTouristSection,
  touristNavigation,
} from "./tourist-nav-items";
import styles from "./tourist-shell.module.css";

/**
 * Compact mobile navigation for the tourist shell (AGENTS.md UI rule 3: field use
 * happens on a phone).
 *
 * Below the header breakpoint the desktop nav row is hidden, which left a visitor
 * on a phone with no way to move between home, destinations and permits except the
 * cards on one page. This is a fixed bottom bar — thumb-reachable, icon plus label
 * so colour is never the only signal — driven by the same `touristNavigation` list
 * the header renders. It is a client component only because the active tab needs
 * `usePathname`; the shell itself stays on the server.
 */
export function TouristMobileNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Visitor navigation" className={styles.tabbar}>
      <div className={styles.tabbarInner}>
        {touristNavigation.map(({ href, label, icon: Icon }) => {
          const isActive = isTouristSection(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={styles.tab}
              data-active={isActive}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.25 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
