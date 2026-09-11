import { Megaphone } from "lucide-react";
import { describeDay, severityTone, type BadgeTone } from "@/lib/department-labels";
import { ALERT_STATE_LABEL, alertState, type AlertState } from "@/lib/alert-rules";
import { Badge } from "@/components/department/badge";
import { AlertToggle } from "@/components/department/alert-toggle";
import type { AlertRow } from "@/types/rows";

/**
 * Where a lifecycle state sits in the tone vocabulary. `INACTIVE` and `EXPIRED` are
 * quiet on purpose: they describe a notice nobody is currently being shown, so they
 * must not compete with a live one for the operator's attention.
 */
const STATE_TONE: Record<AlertState, BadgeTone> = {
  ACTIVE: "green",
  SCHEDULED: "pending",
  EXPIRED: "default",
  INACTIVE: "default",
};

/**
 * Alerts for a destination.
 *
 * One markup path for two views. The read-only form (console overview, tourist
 * detail) shows what is currently displaying. Passing `manage` with `now` adds the
 * lifecycle state and the activate/deactivate control, and is what lets an operator
 * see the notices that are deliberately NOT showing — without which a blank list
 * would imply nothing was raised when several are merely switched off.
 *
 * Colour is never the only signal: the severity and the state are both written out
 * as text beside their badge.
 */
export function AlertsList({
  alerts,
  now,
  manage = false,
}: {
  alerts: AlertRow[];
  now?: Date;
  manage?: boolean;
}) {
  if (alerts.length === 0) {
    return (
      <p className="empty-note">
        <Megaphone aria-hidden="true" size={16} />
        {manage
          ? "No alerts have been raised for this destination yet."
          : "No active alerts for this destination."}
      </p>
    );
  }

  return (
    <ul className="alert-list">
      {alerts.map((alert) => {
        const state = now ? alertState(alert, now) : null;
        return (
          <li
            key={alert.id}
            className="alert-item"
            data-severity={alert.severity.toLowerCase()}
            data-state={state?.toLowerCase()}
          >
            <div className="alert-item__head">
              <strong>{alert.title}</strong>
              <span className="alert-item__badges">
                {state ? <Badge tone={STATE_TONE[state]}>{ALERT_STATE_LABEL[state]}</Badge> : null}
                <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
              </span>
            </div>
            <p className="alert-item__message">{alert.message}</p>
            {alert.ends_at ? (
              <p className="alert-item__window">
                Until {describeDay(alert.ends_at.slice(0, 10))}
              </p>
            ) : null}
            {manage ? (
              <div className="alert-item__actions">
                <AlertToggle alert={alert} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
