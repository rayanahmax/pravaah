import type { ReactNode } from "react";
import type { BadgeTone } from "@/lib/department-labels";
import styles from "./ui.module.css";

/**
 * Aliased to the console's tone vocabulary rather than restated. `severityTone()`
 * and `permitBadge()` return a `BadgeTone` and pages pass it straight here, so two
 * independently maintained unions would let a new tone arrive with no matching
 * `.pill--*` class and render unstyled — the exact drift that made WARNING and
 * CRITICAL indistinguishable before migration 015.
 */
export type PillTone = BadgeTone;

/**
 * A status pill. The tone is a visual cue only and is always paired with text —
 * colour is never the sole signal (ui-ux-pro-max accessibility checklist).
 */
export function StatusPill({
  tone = "default",
  dot = false,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
}) {
  const className =
    tone === "default" ? styles.pill : `${styles.pill} ${styles[`pill--${tone}`]}`;
  return (
    <span className={className}>
      {dot ? <span className={styles["pill__dot"]} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
