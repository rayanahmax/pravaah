import { Card, StatusPill, type PillTone } from "@/components/tourist/ui";
import type { CapacityDto } from "@/types/tourist";
import styles from "./discovery.module.css";

interface CapacityGaugeProps {
  capacity: CapacityDto;
}

function getCapacityTone(status: CapacityDto["status"]): PillTone {
  switch (status) {
    case "AVAILABLE":
      return "green";
    case "NEAR_CAPACITY":
      return "pending";
    case "RESTRICTED":
      return "restricted";
    case "CLOSED":
      return "default";
    default:
      return "default";
  }
}

function getProgressClass(status: CapacityDto["status"]): string {
  switch (status) {
    case "AVAILABLE":
      return styles.progressAvailable;
    case "NEAR_CAPACITY":
      return styles.progressNearCapacity;
    case "RESTRICTED":
      return styles.progressRestricted;
    case "CLOSED":
    default:
      return styles.progressClosed;
  }
}

export function CapacityGauge({ capacity }: CapacityGaugeProps) {
  const percentageDisplay = Math.min(100, Math.max(0, capacity.percentage));

  return (
    <Card
      eyebrow="Live Monitoring"
      title="Capacity & Occupancy"
      action={
        <StatusPill tone={getCapacityTone(capacity.status)} dot>
          {capacity.status.replace("_", " ")}
        </StatusPill>
      }
    >
      <div className={styles.gaugeContainer}>
        <div className={styles.statGrid}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Max Capacity</span>
            <span className={styles.statValue}>{capacity.capacity}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Current Occupancy</span>
            <span className={styles.statValue}>{capacity.occupancy}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Remaining Spots</span>
            <span className={styles.statValue}>{capacity.remaining}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Load Factor</span>
            <span className={styles.statValue}>{capacity.percentage}%</span>
          </div>
        </div>

        <div>
          <div className={styles.capacitySummary}>
            <span>Capacity Utilisation</span>
            <span>{capacity.occupancy} / {capacity.capacity} visitors</span>
          </div>
          <div className={styles.gaugeBarLarge}>
            <div
              className={`${styles.progressBar} ${getProgressClass(capacity.status)}`}
              style={{ width: `${percentageDisplay}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
