import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, StatusPill } from "@/components/tourist/ui";
import { describeDay, permitBadge, permitReference } from "@/lib/department-labels";
import { requireAuth } from "@/lib/auth";
import { listMyPermits } from "@/services/permits";
import { listDestinations } from "@/services/destinations";
import styles from "@/components/tourist/permits/permits.module.css";

export const metadata: Metadata = { title: "My permits" };

/**
 * The tourist's own permits. Requires a signed-in visitor; reads only their rows
 * (RLS-scoped). Destination names are resolved from the public destination list so
 * the queue is readable without exposing any owner identity.
 */
export default async function MyPermitsPage() {
  const profile = await requireAuth();

  const [permits, destinations] = await Promise.all([
    listMyPermits(profile.id),
    listDestinations().catch(() => []),
  ]);
  const nameById = new Map(destinations.map((d) => [d.id, d.name]));

  return (
    <>
      <div className={styles.head}>
        <div>
          <p className={styles["head__eyebrow"]}>Your requests</p>
          <h1 className={styles["head__title"]}>My permits</h1>
          <p className={styles["head__desc"]}>Every permit you have requested, with its current status.</p>
        </div>
        <Link href="/my-permits/new" className={styles.newBtn}>
          <Plus size={16} aria-hidden="true" /> New request
        </Link>
      </div>

      {permits.length === 0 ? (
        <EmptyState
          title="No permits yet"
          message="When you request a permit for a destination it will appear here with its status."
        />
      ) : (
        <div className={styles.list}>
          {permits.map((permit) => {
            const badge = permitBadge(permit.status);
            return (
              <Link key={permit.id} href={`/my-permits/${permit.id}`} className={styles.row}>
                <div className={styles["row__main"]}>
                  <span className={styles["row__dest"]}>{nameById.get(permit.destination_id) ?? "Destination"}</span>
                  <span className={styles["row__meta"]}>
                    {describeDay(permit.visit_date)} · group of {permit.group_size}
                  </span>
                </div>
                <div className={styles["row__right"]}>
                  <span className={styles["row__ref"]}>{permitReference(permit.id)}</span>
                  <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
