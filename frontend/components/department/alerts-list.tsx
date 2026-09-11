import { Megaphone } from "lucide-react";
import { describeDay, severityTone } from "@/lib/department-labels";
import { Badge } from "@/components/department/badge";
import type { AlertRow } from "@/types/rows";

/**
 * Active alerts for a destination (read side only — creating and deactivating
 * alerts is Phase 16). Colour alone is never the only signal: the severity is
 * written out in the badge text as well.
 */
export function AlertsList({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <p className="empty-note">
        <Megaphone aria-hidden="true" size={16} />
        No active alerts for this destination.
      </p>
    );
  }

  return (
    <ul className="alert-list">
      {alerts.map((alert) => (
        <li key={alert.id} className="alert-item" data-severity={alert.severity.toLowerCase()}>
          <div className="alert-item__head">
            <strong>{alert.title}</strong>
            <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
          </div>
          <p className="alert-item__message">{alert.message}</p>
          {alert.ends_at ? <p className="alert-item__window">Until {describeDay(alert.ends_at.slice(0, 10))}</p> : null}
        </li>
      ))}
    </ul>
  );
}
