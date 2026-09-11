import type { Metadata } from "next";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "Destination" };

/**
 * Destination detail. Owned by Person A (Discovery). Public read of
 * GET /api/v1/destinations/{id} (destination + capacity + quota + alerts).
 */
export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SectionHeader
        eyebrow="Destination"
        title="Destination detail"
        description="Live capacity band, remaining places, today's quota and active alerts, with the weather and readiness panels shown as 'coming soon'."
      />
      <RouteStub
        path={`/destinations/${id}`}
        owner="Person A · Discovery"
        purpose="render the destination detail, its capacity/status and alerts, and a 'Request a permit' call to action linking to /my-permits/new."
      />
    </>
  );
}
