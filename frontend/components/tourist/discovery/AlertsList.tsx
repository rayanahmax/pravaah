import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { Card, EmptyState } from "@/components/tourist/ui";
import type { AlertRow } from "@/types/tourist";
import styles from "./discovery.module.css";

interface AlertsListProps {
  alerts: AlertRow[];
}

function getAlertStyle(severity: AlertRow["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return `${styles.alertCard} ${styles.alertCritical}`;
    case "WARNING":
      return `${styles.alertCard} ${styles.alertWarning}`;
    case "INFO":
    default:
      return `${styles.alertCard} ${styles.alertInfo}`;
  }
}

function getAlertIcon(severity: AlertRow["severity"]) {
  switch (severity) {
    case "CRITICAL":
      return <AlertOctagon size={20} aria-hidden="true" />;
    case "WARNING":
      return <AlertTriangle size={20} aria-hidden="true" />;
    case "INFO":
    default:
      return <Info size={20} aria-hidden="true" />;
  }
}

export function AlertsList({ alerts }: AlertsListProps) {
  return (
    <Card eyebrow="Safety & Notices" title="Active Advisories">
      {alerts.length > 0 ? (
        <div className={styles.alertList}>
          {alerts.map((alert) => (
            <div key={alert.id} className={getAlertStyle(alert.severity)}>
              <div>{getAlertIcon(alert.severity)}</div>
              <div>
                <h4 className={styles.alertTitle}>{alert.title}</h4>
                <p className={styles.alertMessage}>{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No active advisories"
          message="There are no active weather, safety, or access restriction alerts reported for this destination."
        />
      )}
    </Card>
  );
}
