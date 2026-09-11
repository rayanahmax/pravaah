import { Card, StatusPill } from "@/components/tourist/ui";
import type { QuotaDto } from "@/types/tourist";
import styles from "./discovery.module.css";

interface QuotaSummaryProps {
  quota: QuotaDto;
}

export function QuotaSummary({ quota }: QuotaSummaryProps) {
  const hasLimit = quota.quota !== null;

  return (
    <Card
      eyebrow="Daily Limits"
      title="Today's Permit Quota"
      action={
        <StatusPill tone={hasLimit && quota.remaining > 0 ? "green" : "restricted"}>
          {hasLimit ? `${quota.remaining} slots open` : "Unrestricted"}
        </StatusPill>
      }
    >
      <div className={styles.statGrid}>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Daily Cap</span>
          <span className={styles.statValue}>
            {hasLimit ? quota.quota : "No limit"}
          </span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Admitted Visitors</span>
          <span className={styles.statValue}>
            {quota.visitors_admitted ?? 0}
          </span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>Remaining Quota</span>
          <span className={styles.statValue}>
            {hasLimit ? quota.remaining : "N/A"}
          </span>
        </div>
      </div>
    </Card>
  );
}
