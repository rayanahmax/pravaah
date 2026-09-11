import type { Metadata } from "next";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "Destinations" };

/** Public destination browser. Owned by Person A (Discovery) in Phase 13. */
export default function DestinationsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Plan a visit"
        title="Destinations"
        description="Browse regulated destinations and see live capacity, access status and any active alerts before you request a permit."
      />
      <RouteStub
        path="/destinations"
        owner="Person A · Discovery"
        purpose="list public destinations with a capacity/status summary each, linking to the detail page."
      />
    </>
  );
}
