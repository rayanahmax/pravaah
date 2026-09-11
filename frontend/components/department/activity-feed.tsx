import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { formatClock } from "@/lib/department-labels";
import type { CheckpointActivity } from "@/services/dashboard";

/**
 * Recent checkpoint movements for one destination.
 *
 * Shows the group size and direction only — a permit reference would add no
 * operational value and API rule 4 keeps unnecessary PII out of these surfaces.
 * The panel owns its own empty state so a quiet checkpoint reads as calm, not as
 * a failure.
 */
export function ActivityFeed({ activity }: { activity: CheckpointActivity[] }) {
  if (activity.length === 0) {
    return <p className="empty-note">No checkpoint movements recorded yet for this destination.</p>;
  }

  return (
    <ul className="activity-list">
      {activity.map((event) => {
        const Icon = event.kind === "in" ? ArrowDownToLine : ArrowUpFromLine;
        return (
          <li key={`${event.kind}-${event.permitId}-${event.at}`}>
            <span className={`activity-icon activity-icon--${event.kind}`}>
              <Icon aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>{event.kind === "in" ? "Group checked in" : "Group checked out"}</strong>
              <small>{`Group of ${event.groupSize}`}</small>
            </span>
            <time dateTime={event.at}>{formatClock(event.at)}</time>
          </li>
        );
      })}
    </ul>
  );
}
