import { listDestinations } from "@/services/destinations";
import type { DestinationRow } from "@/types/rows";

/**
 * Server-only helpers for the department console.
 *
 * The console operates on one destination at a time, selected through the
 * `?destination=` search parameter. These helpers resolve that selection and
 * keep the read path consistent across every page so the switcher, the header
 * and the data can never disagree about which destination is on screen.
 *
 * Every list is already filtered by row level security through the request
 * scoped client in the services, so an operator only ever sees destinations they
 * can read.
 */

export type ResolvedDestination = {
  /** Every destination the operator can see, ordered by name. */
  destinations: DestinationRow[];
  /** The active destination, or null when none exists to show. */
  destination: DestinationRow | null;
};

/**
 * Resolve the active destination for a console page.
 *
 * Falls back to the first visible destination when the parameter is absent or
 * points at a destination the operator cannot read — never at a row RLS hid, and
 * never inventing one. The parameter is read from the awaited `searchParams` the
 * page received, so this stays a pure resolution over already-trusted values.
 */
export async function resolveActiveDestination(
  searchParams: Record<string, string | string[] | undefined>
): Promise<ResolvedDestination> {
  const destinations = await listDestinations();

  const raw = searchParams.destination;
  const wanted = Array.isArray(raw) ? raw[0] : raw;

  const destination =
    (wanted ? destinations.find((d) => d.id === wanted) : undefined) ??
    destinations[0] ??
    null;

  return { destinations, destination };
}
