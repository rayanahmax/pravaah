import type { ReactNode } from "react";
import styles from "./discovery.module.css";

interface ComingSoonPanelProps {
  icon: ReactNode;
  title: string;
  phaseLabel: string;
  description: string;
}

export function ComingSoonPanel({
  icon,
  title,
  phaseLabel,
  description,
}: ComingSoonPanelProps) {
  return (
    <div className={styles.comingSoonCard}>
      <div className={styles.comingSoonIcon}>{icon}</div>
      <div>
        <h4 className={styles.comingSoonTitle}>
          <span>{title}</span>
          <span className={styles.comingSoonBadge}>{phaseLabel}</span>
        </h4>
        <p className={styles.comingSoonText}>{description}</p>
      </div>
    </div>
  );
}
