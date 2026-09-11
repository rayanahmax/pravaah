import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Info,
  MapPin,
  PlusCircle,
  QrCode,
  TicketCheck,
} from "lucide-react";
import { EmptyState, StatusPill } from "@/components/tourist/ui";
import { getProfile } from "@/lib/auth";
import { describeDay, permitBadge, permitReference } from "@/lib/department-labels";
import type { PermitStatus } from "@/lib/permit-rules";
import { listMyPermits } from "@/services/permits";
import { listDestinations } from "@/services/destinations";
import styles from "./visitor-home.module.css";

export const metadata: Metadata = { title: "Visitor home" };

/** Statuses a visitor still needs to act on or carry. Cancelled, rejected,
 *  expired and completed permits stay in "My permits" and are not surfaced here. */
const LIVE_STATUSES: readonly PermitStatus[] = ["PENDING", "APPROVED", "RESTRICTED", "CHECKED_IN"];

/**
 * Visitor home — the landing surface for the tourist role.
 *
 * It is deliberately PUBLIC, like the rest of the tourist shell: destination
 * information is open, so the page must not bounce an anonymous visitor to sign-in
 * just to see what PRAVAAH offers. The two actions that need an identity (request
 * a permit, view your permits) are guarded on their own pages by `requireAuth`,
 * which keeps the auth boundary per-route instead of a blanket redirect.
 *
 * Everything shown about a permit is read server-side from the visitor's own
 * RLS-scoped rows; no status, capacity or quota figure is taken from the browser.
 */
export default async function VisitorHomePage() {
  const profile = await getProfile();

  const [permits, destinations] = await Promise.all([
    profile ? listMyPermits(profile.id).catch(() => []) : Promise.resolve([]),
    listDestinations().catch(() => []),
  ]);

  const nameById = new Map(destinations.map((destination) => [destination.id, destination.name]));
  const live = permits.filter((permit) => LIVE_STATUSES.includes(permit.status)).slice(0, 4);
  const firstName = profile?.full_name?.trim().split(" ")[0] || null;

  return (
    <>
      <div className={styles.head}>
        <div>
          <p className={styles["head__eyebrow"]}>PRAVAAH · visitor home</p>
          <h1 className={styles["head__title"]}>
            {firstName ? `Welcome back, ${firstName}` : "Plan your visit"}
          </h1>
          <p className={styles["head__desc"]}>
            Request an entry permit for a regulated destination, follow the department&apos;s
            decision, and carry your QR pass for the checkpoint.
          </p>
        </div>
      </div>

      {!profile ? (
        <p className={styles.notice}>
          <Info size={16} aria-hidden="true" />
          <span>
            You can browse destinations without an account. Requesting a permit and tracking your
            own requests needs one — <Link href="/register">create an account</Link> or{" "}
            <Link href="/login">sign in</Link>.
          </span>
        </p>
      ) : null}

      <div className={styles.actions}>
        <Link href="/my-permits/new" className={`${styles.action} ${styles["action--primary"]}`}>
          <span className={styles.action__icon}>
            <PlusCircle size={22} aria-hidden="true" />
          </span>
          <h2 className={styles.action__title}>
            Request a permit <ArrowRight size={18} aria-hidden="true" />
          </h2>
          <p className={styles.action__desc}>
            Choose a destination and a visit date, then submit your group size. The department
            decides the approval against carrying capacity and the daily quota.
          </p>
        </Link>

        <Link href="/my-permits" className={styles.action}>
          <span className={styles.action__icon}>
            <TicketCheck size={22} aria-hidden="true" />
          </span>
          <h2 className={styles.action__title}>
            My permits <ArrowRight size={18} aria-hidden="true" />
          </h2>
          <p className={styles.action__desc}>
            Every request you have made with its current status, and the QR pass once a permit is
            approved.
          </p>
          {live.length > 0 ? (
            <span className={styles.action__tag}>
              {live.length} live {live.length === 1 ? "request" : "requests"}
            </span>
          ) : null}
        </Link>
      </div>

      <div className={styles.secondary}>
        <Link href="/destinations" className={styles["secondary__link"]}>
          <span>
            <MapPin size={18} aria-hidden="true" />
            <span className={styles.secondary__text}>
              Browse destinations
              <small>Live capacity, access status and remaining daily quota.</small>
            </span>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <Link href="/readiness" className={styles["secondary__link"]}>
          <span>
            <ClipboardCheck size={18} aria-hidden="true" />
            <span className={styles.secondary__text}>
              Check your readiness
              <small>A guidance checklist for the destination you plan to visit.</small>
            </span>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <section className={styles.section} aria-labelledby="live-heading">
        <div className={styles.section__head}>
          <div>
            <h2 id="live-heading">Where your permits stand</h2>
            <p>Requests that still need a decision, or are ready to use at the checkpoint.</p>
          </div>
          <Link href="/my-permits" className={styles.emptyLink}>
            View all
          </Link>
        </div>

        {live.length === 0 ? (
          <div className={styles.emptyRow}>
            <EmptyState
              icon={<TicketCheck size={22} aria-hidden="true" />}
              title={profile ? "No open requests" : "Nothing to show yet"}
              message={
                profile
                  ? "Once you request a permit for a destination it appears here until the visit is complete."
                  : "Sign in and request a permit to track its status and get a QR pass here."
              }
            />
            <div className={styles["emptyRow__actions"]}>
              <Link href="/my-permits/new" className={styles.emptyBtn}>
                Request a permit
              </Link>
              {!profile ? (
                <Link href="/login" className={styles.emptyLink}>
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <ul className={styles.rows}>
            {live.map((permit) => {
              const badge = permitBadge(permit.status);
              return (
                <li key={permit.id} className={styles.row}>
                  <Link href={`/my-permits/${permit.id}`} className={styles.row__link}>
                    <span className={styles.row__main}>
                      <span className={styles.row__dest}>
                        {nameById.get(permit.destination_id) ?? "Destination"}
                      </span>
                      <span className={styles.row__meta}>
                        {describeDay(permit.visit_date)} · group of {permit.group_size} ·{" "}
                        {permitReference(permit.id)}
                      </span>
                    </span>
                  </Link>
                  <span className={styles.row__right}>
                    {permit.status === "APPROVED" ? (
                      <Link href={`/my-permits/${permit.id}/qr`} className={styles.row__qr}>
                        <QrCode size={14} aria-hidden="true" /> QR pass
                      </Link>
                    ) : null}
                    <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
