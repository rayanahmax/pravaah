import type { ReactNode } from "react";
import styles from "./ui.module.css";

export type PillTone = "default" | "green" | "pending" | "restricted";

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
