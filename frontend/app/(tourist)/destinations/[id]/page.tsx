import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CloudSun, ListChecks, Megaphone } from "lucide-react";
import { EmptyState, StatusPill } from "@/components/tourist/ui";
import { describeCapacity, formatPercent, severityTone } from "@/lib/department-labels";
import { findDestination } from "@/services/destinations";
import { buildCapacityView } from "@/services/capacity";
import { readQuota } from "@/services/quotas";
import { listActiveAlerts } from "@/services/alerts";
import { todayIsoDate } from "@/lib/date";
import styles from "@/components/tourist/discovery/discovery.module.css";

export const metadata: Metadata = { title: "Destination" };

/**
 * Destination detail. Public read of the same authoritative sources the console
 * uses: capacity band (engine-derived), today's quota and active alerts. Weather
 * and readiness are informational panels with no endpoints yet (Phases 14/15), so
 * they render a clear "coming soon" state rather than fabricated data.
 */
export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const destination = await findDestination(id);
  if (!destination) {
    return (
      <EmptyState
        title="Destination not found"
        message="This destination may have been removed or the link is out of date."
      />
    );
  }

  const date = todayIsoDate();
  const [capacity, quota, alerts] = await Promise.all([
    buildCapacityView(destination),
    readQuota(destination.id, date),
    listActiveAlerts(destination.id),
  ]);

  const view = describeCapacity(capacity);
  const width = Math.min(100, capacity.percentage);
  const closed = capacity.status === "CLOSED";
  const requestHref = `/my-permits/new?destination=${encodeURIComponent(destination.id)}`;

  return (
    <div className={styles.detail}>
      <Link href="/destinations" className={styles["back-link"]}>
        <ArrowLeft size={15} aria-hidden="true" /> All destinations
      </Link>

      <div className={styles["detail__grid"]}>
        <div style={{ display: "grid", gap: 20 }}>
          <section className={styles.hero}>
            <p className={styles["hero__eyebrow"]}>{destination.type ?? "Destination"}</p>
            <h1 className={styles["hero__title"]}>{destination.name}</h1>
            {destination.description ? (
              <p className={styles["hero__desc"]}>{destination.description}</p>
            ) : null}
            <StatusPill tone={view.tone} dot>
              {view.label}
            </StatusPill>
          </section>

          <section className={styles.hero} aria-label="Live capacity">
            <div className={styles["meter__row"]}>
              <strong style={{ fontSize: 20, color: "#0f172a" }}>
                {capacity.occupancy} / {capacity.capacity}
              </strong>
              <span>{formatPercent(capacity.percentage)} occupied</span>
            </div>
            <div className={styles["meter__track"]} role="img" aria-label={`Occupancy ${capacity.percentage} percent`}>
              <span className={styles["meter__fill"]} data-status={capacity.status} style={{ width: `${width}%` }} />
            </div>
            {view.overrideNote ? <p className={styles["hero__desc"]}>{view.overrideNote}</p> : null}

            <dl className={styles["stat-row"]}>
              <div className={styles.stat}>
                <dt>Places remaining</dt>
                <dd>{capacity.remaining}</dd>
              </div>
              <div className={styles.stat}>
                <dt>Today&apos;s quota</dt>
                <dd>{quota.quota === null ? "Not set" : quota.remaining}</dd>
              </div>
            </dl>

            <div className={styles["cta-row"]}>
              <Link
                href={requestHref}
                className={styles["cta-primary"]}
                aria-disabled={closed}
              >
                Request a permit <ArrowRight size={16} aria-hidden="true" />
              </Link>
              {closed ? (
                <span className={styles["hero__desc"]}>This destination is currently closed to new permits.</span>
              ) : null}
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gap: 20 }}>
          <section className={styles.hero} aria-label="Destination facts">
            <p className={styles["hero__eyebrow"]}>Good to know</p>
            <dl className={styles.facts}>
              {destination.difficulty ? (
                <div className={styles.fact}><dt>Difficulty</dt><dd>{destination.difficulty}</dd></div>
              ) : null}
              {destination.elevation != null ? (
                <div className={styles.fact}><dt>Elevation</dt><dd>{destination.elevation} m</dd></div>
              ) : null}
              {destination.estimated_duration_minutes != null ? (
                <div className={styles.fact}><dt>Est. duration</dt><dd>{destination.estimated_duration_minutes} min</dd></div>
              ) : null}
              {destination.latitude != null && destination.longitude != null ? (
                <div className={styles.fact}><dt>Coordinates</dt><dd>{destination.latitude.toFixed(3)}, {destination.longitude.toFixed(3)}</dd></div>
              ) : null}
            </dl>
          </section>

          <section className={styles.hero} aria-label="Active alerts">
            <p className={styles["hero__eyebrow"]}><Megaphone size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Field safety</p>
            {alerts.length === 0 ? (
              <p className={styles["hero__desc"]}>No active alerts for this destination.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {alerts.map((alert) => (
                  <div key={alert.id} className={styles.stub_panel} style={{ borderStyle: "solid", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <h3>{alert.title}</h3>
                      <StatusPill tone={severityTone(alert.severity)}>{alert.severity}</StatusPill>
                    </div>
                    <p>{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles["stub-panel"]} aria-label="Weather">
            <span className={styles["stub-panel__tag"]}><CloudSun size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Coming soon</span>
            <h3>Weather &amp; conditions</h3>
            <p>Authoritative weather and advisories for this destination arrive with a later phase.</p>
          </section>

          <section className={styles["stub-panel"]} aria-label="Readiness">
            <span className={styles["stub-panel__tag"]}><ListChecks size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px" }} /> Coming soon</span>
            <h3>Readiness check</h3>
            <p>A rule-based readiness questionnaire will help you judge whether this trek suits you.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
