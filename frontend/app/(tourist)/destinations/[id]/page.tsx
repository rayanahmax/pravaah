import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CloudSun, Compass, TicketCheck } from "lucide-react";
import { SectionHeader, Card, StatusPill, type PillTone } from "@/components/tourist/ui";
import {
  CapacityGauge,
  QuotaSummary,
  AlertsList,
  ComingSoonPanel,
} from "@/components/tourist/discovery";
import { findDestination } from "@/services/destinations";
import { buildCapacityView, toCapacityDto } from "@/services/capacity";
import { readQuota } from "@/services/quotas";
import { listActiveAlerts } from "@/services/alerts";
import { todayIsoDate } from "@/lib/date";
import styles from "@/components/tourist/discovery/discovery.module.css";

export const metadata: Metadata = { title: "Destination Detail" };

function getAccessTone(accessStatus: string): PillTone {
  switch (accessStatus) {
    case "OPEN":
      return "green";
    case "RESTRICTED":
      return "restricted";
    case "CLOSED":
    default:
      return "default";
  }
}

export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const destination = await findDestination(id);

  if (!destination) {
    notFound();
  }

  const today = todayIsoDate();
  const [capacityView, quota, alerts] = await Promise.all([
    buildCapacityView(destination),
    readQuota(destination.id, today),
    listActiveAlerts(destination.id),
  ]);

  const capacity = toCapacityDto(capacityView);
  const isClosed = destination.access_status === "CLOSED" || capacity.status === "CLOSED";

  return (
    <>
      <SectionHeader
        eyebrow={destination.type ?? "Destination"}
        title={destination.name}
        description={destination.description ?? "Regulated visitor destination details and conditions."}
        action={
          <StatusPill tone={getAccessTone(destination.access_status)} dot>
            {destination.access_status}
          </StatusPill>
        }
      />

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <CapacityGauge capacity={capacity} />
          <QuotaSummary quota={quota} />
          <AlertsList alerts={alerts} />
        </div>

        <div className={styles.detailSidebar}>
          {/* Action Card */}
          <div className={styles.ctaCard}>
            <div>
              <h3 className={styles.ctaTitle}>Ready to Visit?</h3>
              <p className={styles.ctaText}>
                {isClosed
                  ? "This destination is currently closed for visits."
                  : "Request an access permit for your intended visit date and group size."}
              </p>
            </div>
            {isClosed ? (
              <span className={`${styles.ctaButton} ${styles.disabledCta}`}>
                <span>Access Closed</span>
              </span>
            ) : (
              <Link
                href={`/my-permits/new?destination_id=${destination.id}`}
                className={styles.ctaButton}
              >
                <TicketCheck size={18} aria-hidden="true" />
                <span>Request a permit</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>

          {/* Quick Specifications */}
          <Card eyebrow="Specifications" title="Site Details">
            <div className={styles.statGrid}>
              {destination.difficulty ? (
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Difficulty</span>
                  <span className={styles.statValue}>{destination.difficulty}</span>
                </div>
              ) : null}
              {destination.estimated_duration_minutes ? (
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Est. Duration</span>
                  <span className={styles.statValue}>
                    {destination.estimated_duration_minutes}m
                  </span>
                </div>
              ) : null}
              {destination.elevation ? (
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Elevation</span>
                  <span className={styles.statValue}>{destination.elevation}m</span>
                </div>
              ) : null}
              {destination.latitude && destination.longitude ? (
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Coordinates</span>
                  <span className={styles.statValue} style={{ fontSize: "13px" }}>
                    {destination.latitude.toFixed(2)}, {destination.longitude.toFixed(2)}
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Coming Soon Panels per Phase 13 Spec */}
          <ComingSoonPanel
            icon={<CloudSun size={22} />}
            title="Weather Forecast"
            phaseLabel="Phase 15"
            description="Real-time localized meteorological forecasts and weather alerts will arrive with Phase 15."
          />

          <ComingSoonPanel
            icon={<Compass size={22} />}
            title="Trail Readiness"
            phaseLabel="Phase 14"
            description="Trail condition reports, gear requirements and safety readiness scores arrive with Phase 14."
          />
        </div>
      </div>
    </>
  );
}
