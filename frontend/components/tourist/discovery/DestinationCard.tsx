import Link from "next/link";
import { MapPin } from "lucide-react";
import { StatusPill } from "@/components/tourist/ui";
import { describeCapacity, formatPercent } from "@/lib/department-labels";
import type { CapacityResult } from "@/lib/capacity";
import type { DestinationRow } from "@/types/rows";
import styles from "./discovery.module.css";

/**
 * A destination tile for the tourist browser. It shows only public facts and the
 * live capacity band computed server-side by the caller — no client-supplied
 * status. Linking navigates to the destination detail page.
 */
export function DestinationCard({
  destination,
  capacity,
}: {
  destination: DestinationRow;
  capacity: CapacityResult;
}) {
  const view = describeCapacity(capacity);
  const width = Math.min(100, capacity.percentage);

  return (
    <Link href={`/destinations/${destination.id}`} className={styles.dest}>
      <div className={styles["dest__head"]}>
        <div>
          <h3 className={styles["dest__name"]}>{destination.name}</h3>
          {destination.type ? <p className={styles["dest__type"]}>{destination.type}</p> : null}
        </div>
        <StatusPill tone={view.tone} dot>
          {view.label}
        </StatusPill>
      </div>

      {destination.description ? (
        <p className={styles["dest__desc"]}>{destination.description}</p>
      ) : (
        <p className={styles["dest__desc"]}>
          <MapPin size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Regulated destination
        </p>
      )}

      <div className={styles.meter}>
        <div className={styles["meter__row"]}>
          <span>
            {capacity.occupancy} / {capacity.capacity} inside
          </span>
          <span>{formatPercent(capacity.percentage)}</span>
        </div>
        <div
          className={styles["meter__track"]}
          role="img"
          aria-label={`Occupancy ${capacity.percentage} percent of capacity`}
        >
          <span className={styles["meter__fill"]} data-status={capacity.status} style={{ width: `${width}%` }} />
        </div>
      </div>
    </Link>
  );
}
