import type { ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * Lead-owned card shell for the tourist UI. Presentational only — it decides no
 * state and trusts nothing about its content. Stream owners compose it; they do
 * not edit it.
 */
export function Card({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasHead = Boolean(eyebrow || title || action);
  return (
    <section className={styles.card}>
      {hasHead ? (
        <div className={styles["card__head"]}>
          <div>
            {eyebrow ? <p className={styles["card__eyebrow"]}>{eyebrow}</p> : null}
            {title ? <h2 className={styles["card__title"]}>{title}</h2> : null}
          </div>
          {action ? <div className={styles["card__action"]}>{action}</div> : null}
        </div>
      ) : null}
      <div className={styles["card__body"]}>{children}</div>
    </section>
  );
}
