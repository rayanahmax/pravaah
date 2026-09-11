import type { ReactNode } from "react";
import styles from "./ui.module.css";

/** Page-level header with an eyebrow, title, description and optional action slot. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={styles.section}>
      <div>
        {eyebrow ? <p className={styles["section__eyebrow"]}>{eyebrow}</p> : null}
        <h1 className={styles["section__title"]}>{title}</h1>
        {description ? <p className={styles["section__desc"]}>{description}</p> : null}
      </div>
      {action ? <div className={styles["section__action"]}>{action}</div> : null}
    </header>
  );
}
