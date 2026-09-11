import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeader, EmptyState } from "@/components/tourist/ui";
import { requireAuth } from "@/lib/auth";
import { findDestination, listDestinations } from "@/services/destinations";
import { ReadinessForm } from "@/components/tourist/readiness/readiness-form";
import styles from "@/components/tourist/readiness/readiness.module.css";

export const metadata: Metadata = { title: "Readiness check" };

/**
 * Readiness questionnaire (Phase 14). Requires a signed-in visitor so the result
 * can be stored against their account. With no destination chosen it offers a
 * picker; with one it renders the questionnaire. The result is deterministic and
 * informational — never a permit decision (PRD §13-14).
 */
export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();
  const params = await searchParams;
  const raw = Array.isArray(params.destination) ? params.destination[0] : params.destination;

  if (!raw) {
    const destinations = await listDestinations().catch(() => []);
    return (
      <>
        <SectionHeader
          eyebrow="Plan responsibly"
          title="Readiness check"
          description="Pick a destination to run a quick, informational readiness check."
        />
        {destinations.length === 0 ? (
          <EmptyState title="No destinations yet" message="Destinations will appear here once published." />
        ) : (
          <div className={styles.picker}>
            {destinations.map((d) => (
              <Link key={d.id} href={`/readiness?destination=${d.id}`} className={styles.picker__item}>
                <span>{d.name}</span>
                {d.difficulty ? <small>{d.difficulty}</small> : null}
              </Link>
            ))}
          </div>
        )}
      </>
    );
  }

  const destination = await findDestination(raw);
  if (!destination) {
    return (
      <EmptyState
        title="Destination not found"
        message="Choose a destination from the list to run a readiness check."
      />
    );
  }

  return (
    <>
      <SectionHeader
        eyebrow="Plan responsibly"
        title="Readiness check"
        description={`An informational readiness check for ${destination.name}.`}
        action={
          <Link href={`/destinations/${destination.id}`} className={styles["ai__tag"]}>
            Back to destination
          </Link>
        }
      />
      <ReadinessForm destinationId={destination.id} destinationName={destination.name} />
    </>
  );
}
