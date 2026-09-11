"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTouristSection, touristNavigation } from "./tourist-nav-items";
import styles from "./tourist-shell.module.css";

/**
 * The tourist shell's navigation, in both chrome forms.
 *
 * Both variants read the one `touristNavigation` list, so a phone never offers a
 * route a laptop does not and the two cannot drift. They live in a client file for
 * exactly one reason: the active item needs `usePathname`, which the server-rendered
 * shell cannot call. Everything else about the shell stays on the server.
 */

/** Header row, shown from the 720px breakpoint up. */
export function TouristHeaderNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Primary">
      {touristNavigation.map(({ href, label, icon: Icon }) => {
        const isActive = isTouristSection(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={styles.navLink}
            data-active={isActive}
          >
            <Icon size={17} aria-hidden="true" strokeWidth={isActive ? 2.25 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Compact bottom tab bar for phones (AGENTS.md UI rule 3: field use happens on a
 * phone). Below the header breakpoint the nav row is hidden, which previously left
 * a visitor unable to move between sections except via the cards on one page.
 * Icon over label, so colour is never the only carrier of meaning.
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
