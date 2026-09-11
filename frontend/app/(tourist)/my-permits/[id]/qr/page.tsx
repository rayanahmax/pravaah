import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldQuestion } from "lucide-react";
import { EmptyState } from "@/components/tourist/ui";
import { PermitDocument } from "@/components/tourist/qr/permit-document";
import { requireAuth } from "@/lib/auth";
import { getPermit, getPermitQr } from "@/services/permits";
import { findDestination } from "@/services/destinations";
import { QrCode } from "@/components/tourist/qr/qr-code";
import styles from "@/components/tourist/qr/qr.module.css";

export const metadata: Metadata = { title: "Permit QR" };

/**
 * The tourist QR pass: the full eco-tourism permit certificate with the scannable
 * QR. Owner-only and approved-only (mirrors GET /permits/{id}/qr): another user's
 * permit reads as "not found", and only an APPROVED permit has a pass. The QR
 * encodes the opaque token alone — no visitor identity (PRD §9, AGENTS rule 11).
 */
export default async function PermitQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const { id } = await params;

  const permit = await getPermit(id);
  if (!permit || permit.user_id !== profile.id) {
    return (
      <EmptyState
        title="Permit not found"
        message="This permit does not exist or does not belong to your account."
      />
    );
  }

  if (permit.status !== "APPROVED") {
    return (
      <div className={styles.notice} role="status">
        <ShieldQuestion size={26} aria-hidden="true" />
        <h2>No pass available yet</h2>
        <p>A QR pass is issued only once a permit is approved. This one is currently {permit.status.toLowerCase().replace("_", " ")}.</p>
        <Link href={`/my-permits/${permit.id}`} className={styles.back}>
          <ArrowLeft size={15} aria-hidden="true" /> Back to permit
        </Link>
      </div>
    );
  }

  const [qr, destination] = await Promise.all([
    getPermitQr(permit.id),
    findDestination(permit.destination_id),
  ]);

  if (!qr?.qr_token_hash) {
    return (
      <div className={styles.notice} role="status">
        <ShieldQuestion size={26} aria-hidden="true" />
        <h2>Pass unavailable</h2>
        <p>This approved permit has no QR token issued; contact the department.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <Link href={`/my-permits/${permit.id}`} className={styles.back}>
        <ArrowLeft size={15} aria-hidden="true" /> Back to permit
      </Link>

      <PermitDocument
        permit={permit}
        destination={destination}
        leadName={profile.full_name}
        leadPhone={profile.phone}
      />

      <div className={styles.wrap}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>Scan at the checkpoint</p>
          <h1 className={styles.title}>Your entry QR</h1>
        </div>
        <div className={styles.card}>
          <div className={styles.qr}>
            <QrCode value={qr.qr_token_hash} />
          </div>
          <p className={styles.hint}>
            The code carries a one-time reference only and reveals nothing about you. Keep this
            screen until you have checked in.
          </p>
        </div>
      </div>
    </div>
  );
}
