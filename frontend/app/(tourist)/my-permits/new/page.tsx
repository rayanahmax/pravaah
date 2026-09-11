import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "Request a permit" };

/**
 * Permit request form. Owned by Person B (Permits journey). Posts to
 * POST /api/v1/permits; the server decides eligibility, never the form.
 */
export default async function NewPermitPage() {
  await requireAuth();
  return (
    <>
      <SectionHeader
        eyebrow="New request"
        title="Request a permit"
        description="Choose a destination, visit date and group size. Approval is decided by the department against live capacity and quota."
      />
      <RouteStub
        path="/my-permits/new"
        owner="Person B · Permits"
        purpose="collect destination, visit_date and group_size and POST /permits; surface the server's refusal codes (DATE_IN_PAST, CAPACITY_EXCEEDED, DESTINATION_CLOSED, ...)."
      />
    </>
  );
}
