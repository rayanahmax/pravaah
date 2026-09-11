import type { Metadata } from "next";
import { SectionHeader } from "@/components/tourist/ui";
import { DestinationGrid, type DestinationWithCapacity } from "@/components/tourist/discovery";
import { listDestinations } from "@/services/destinations";
import { buildCapacityView, toCapacityDto } from "@/services/capacity";

export const metadata: Metadata = { title: "Destinations" };

/** Public destination browser. Owned by Person A (Discovery) in Phase 13. */
export default async function DestinationsPage() {
  const destinations = await listDestinations();

  const items: DestinationWithCapacity[] = await Promise.all(
    destinations.map(async (dest) => {
      try {
        const capacityView = await buildCapacityView(dest);
        return {
          destination: dest,
          capacity: toCapacityDto(capacityView),
        };
      } catch {
        return {
          destination: dest,
        };
      }
    })
  );

  return (
    <>
      <SectionHeader
        eyebrow="Plan a visit"
        title="Destinations"
        description="Browse regulated destinations and see live capacity, access status and active advisories before requesting a permit."
      />
      <DestinationGrid items={items} />
    </>
  );
}
