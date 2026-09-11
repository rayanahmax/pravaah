import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { listDestinations } from "@/services/destinations";
import { todayIsoDate } from "@/lib/date";
import { PermitRequestForm } from "@/components/tourist/permits/permit-request-form";
import styles from "@/components/tourist/permits/permits.module.css";

export const metadata: Metadata = { title: "Request a permit" };

/**
 * Permit request page. Requires a signed-in visitor. It only loads the public
 * destination list and the current date to seed the form; every eligibility
 * decision happens on the server when the form posts.
 */
export default async function NewPermitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireAuth();
  const params = await searchParams;
  const raw = Array.isArray(params.destination) ? params.destination[0] : params.destination;

  const destinations = await listDestinations().catch(() => []);

  return (
    <div className={styles.detail}>
      <div>
        <p className={styles["head__eyebrow"]}>New request</p>
        <h1 className={styles["head__title"]}>Request a permit</h1>
        <p className={styles["head__desc"]}>
          Choose a destination, visit date and group size. The department approves requests
          against live capacity and the daily quota.
        </p>
      </div>

      <div className={styles.panel}>
        <PermitRequestForm
          destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
          defaultDestinationId={raw}
          today={todayIsoDate()}
          applicant={{ fullName: profile.full_name, phone: profile.phone }}
        />
      </div>

      <Link href="/my-permits" className={styles.back}>
        <ArrowLeft size={15} aria-hidden="true" /> Back to my permits
      </Link>
    </div>
  );
}
