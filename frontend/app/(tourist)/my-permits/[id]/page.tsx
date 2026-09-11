import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "Permit" };

/**
 * Permit detail / status tracker. Owned by Person B (Permits journey). Reads
 * GET /api/v1/permits/{id} and offers cancel (POST /permits/{id}/cancel).
 */
export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  return (
    <>
      <SectionHeader
        eyebrow="Permit status"
        title="Permit detail"
        description="The current state of one request, its destination and date, and the actions available to you."
      />
      <RouteStub
        path={`/my-permits/${id}`}
        owner="Person B · Permits"
        purpose="show one permit's status (GET /permits/{id}), allow cancel when eligible, and link to the QR screen when APPROVED."
      />
    </>
  );
}
