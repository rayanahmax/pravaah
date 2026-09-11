import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { RouteStub, SectionHeader } from "@/components/tourist/ui";

export const metadata: Metadata = { title: "Permit QR" };

/**
 * Tourist QR screen. Owned by Person C (QR). Reads GET /api/v1/permits/{id}/qr
 * and renders the opaque token with qrcode.react (QRCodeSVG). The token is the
 * only thing shown — no visitor identity.
 */
export default async function PermitQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  return (
    <>
      <SectionHeader
        eyebrow="Your pass"
        title="Permit QR"
        description="Show this code at the checkpoint. It is generated only for an approved permit."
      />
      <RouteStub
        path={`/my-permits/${id}/qr`}
        owner="Person C · QR"
        purpose="fetch the approved permit's token (GET /permits/{id}/qr) and render it with QRCodeSVG from qrcode.react; handle the INVALID_STATE (not approved) case."
      />
    </>
  );
}
