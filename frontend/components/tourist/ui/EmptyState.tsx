import type { ReactNode } from "react";
import styles from "./ui.module.css";

/** A consistent empty/quiet state so "no data yet" never reads as a failure. */
export function EmptyState({
  icon,
  title,
  message,
}: {
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
}) {
  return (
    <div className={styles.empty} role="status">
      {icon ? <span className={styles["empty__icon"]}>{icon}</span> : null}
      <p className={styles["empty__title"]}>{title}</p>
      {message ? <p className={styles["empty__message"]}>{message}</p> : null}
    </div>
  );
}
