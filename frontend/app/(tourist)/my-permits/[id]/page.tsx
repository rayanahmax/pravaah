import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, QrCode } from "lucide-react";
import { EmptyState } from "@/components/tourist/ui";
import { PermitDocument } from "@/components/tourist/qr/permit-document";
import { requireAuth } from "@/lib/auth";
import { getPermit } from "@/services/permits";
import { findDestination } from "@/services/destinations";
import { CancelPermitButton } from "@/components/tourist/permits/cancel-permit-button";
import type { PermitStatus } from "@/lib/permit-rules";
import styles from "@/components/tourist/permits/permits.module.css";

export const metadata: Metadata = { title: "Permit" };

const STEPS: { key: string; label: string; reached: (s: PermitStatus) => boolean }[] = [
  { key: "requested", label: "Requested", reached: () => true },
  { key: "decision", label: "Decision", reached: (s) => s !== "PENDING" },
  { key: "checkin", label: "Checked in", reached: (s) => s === "CHECKED_IN" || s === "COMPLETED" },
  { key: "completed", label: "Completed", reached: (s) => s === "COMPLETED" },
];

/**
 * One permit's detail: the government-style certificate plus a progress tracker
 * and the actions the state allows. RLS-scoped — a permit belonging to someone
 * else reads as absent (never "forbidden").
 */
export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const { id } = await params;

  const permit = await getPermit(id);
  if (!permit) {
    return (
      <EmptyState
        title="Permit not found"
        message="This permit does not exist or does not belong to your account."
      />
    );
  }

  const destination = await findDestination(permit.destination_id);
  const cancellable = permit.status === "PENDING" || permit.status === "APPROVED";

  return (
    <div className={styles.detail}>
      <Link href="/my-permits" className={styles.back}>
        <ArrowLeft size={15} aria-hidden="true" /> My permits
      </Link>

      <div className={styles.panel}>
        <div className={styles["tracker"]} aria-label="Permit progress">
          {STEPS.map((step, i) => (
            <div key={step.key} className={styles["tracker__step"]} data-done={step.reached(permit.status)}>
              <span className={styles["tracker__dot"]}>{i + 1}</span>
              <span className={styles["tracker__label"]}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      <PermitDocument
        permit={permit}
        destination={destination}
        leadName={profile.full_name}
        leadPhone={profile.phone}
      />

      <div className={styles.actions}>
        {permit.status === "APPROVED" ? (
          <Link href={`/my-permits/${permit.id}/qr`} className={styles.linkBtn}>
            <QrCode size={16} aria-hidden="true" /> View QR pass
          </Link>
        ) : null}
        {cancellable ? <CancelPermitButton permitId={permit.id} /> : null}
      </div>
    </div>
  );
}
