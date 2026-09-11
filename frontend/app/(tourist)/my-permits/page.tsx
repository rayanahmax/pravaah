import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "My permits" };

/**
 * The tourist's own permits. Owned by Person B (Permits journey). Requires a
 * signed-in visitor; reads GET /api/v1/permits/my.
 */
export default async function MyPermitsPage() {
  await requireAuth();
  return (
    <>
      <SectionHeader
        eyebrow="Your requests"
        title="My permits"
        description="Every permit you have requested, with its current status and a link to its QR once approved."
      />
      <RouteStub
        path="/my-permits"
        owner="Person B · Permits"
        purpose="list the caller's permits (GET /permits/my) with a status pill each and a 'New request' action."
      />
    </>
  );
}
