import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/tourist/ui";
import { DestinationCard } from "@/components/tourist/discovery/DestinationCard";
import { listDestinations } from "@/services/destinations";
import { buildCapacityView } from "@/services/capacity";
import type { DestinationRow } from "@/types/rows";
import styles from "@/components/tourist/discovery/discovery.module.css";

export const metadata: Metadata = { title: "Plan a visit" };

/**
 * Tourist landing + destination browser. Public: destination information is
 * readable by anyone, so no auth guard. Each tile's capacity band is computed
 * server-side from stored configuration and live occupancy — the browser is never
 * asked to supply a status (AGENTS.md rules 6-7).
 */
export default async function DestinationsPage() {
  let destinations: DestinationRow[];
  try {
    destinations = await listDestinations();
  } catch (error) {
    console.error("[destinations] list failed:", error);
    destinations = [];
  }

  const withCapacity = await Promise.all(
    destinations.map(async (destination) => ({
      destination,
      capacity: await buildCapacityView(destination),
    }))
  );

  return (
    <>
      <section className={styles.hero}>
        <p className={styles["hero__eyebrow"]}>PRAVAAH · regulated visitor access</p>
        <h1 className={styles["hero__title"]}>Find your destination, request a permit</h1>
        <p className={styles["hero__desc"]}>
          Browse regulated destinations and see live capacity, access status and any active
          alerts before you plan a visit. Approvals are decided by the department against
          carrying capacity and daily quota.
        </p>
        <Link href="/my-permits/new" className={styles["hero__cta"]}>
          Request a permit <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      {withCapacity.length === 0 ? (
        <EmptyState
          title="No destinations available yet"
          message="Destinations will appear here once the department publishes them. Check back soon."
        />
      ) : (
        <div className={styles.grid}>
          {withCapacity.map(({ destination, capacity }) => (
            <DestinationCard key={destination.id} destination={destination} capacity={capacity} />
          ))}
        </div>
      )}
    </>
  );
}
