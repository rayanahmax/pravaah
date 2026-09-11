import Link from "next/link";
import { ArrowRight, Clock, Mountain, MapPin } from "lucide-react";
import { Card, StatusPill, type PillTone } from "@/components/tourist/ui";
import type { DestinationRow, CapacityDto } from "@/types/tourist";
import styles from "./discovery.module.css";

interface DestinationCardProps {
  destination: DestinationRow;
  capacity?: CapacityDto;
}

function getAccessTone(accessStatus: DestinationRow["access_status"]): PillTone {
  switch (accessStatus) {
    case "OPEN":
      return "green";
    case "RESTRICTED":
      return "restricted";
    case "CLOSED":
      return "default";
    default:
      return "default";
  }
}

function getCapacityTone(status: CapacityDto["status"]): PillTone {
  switch (status) {
    case "AVAILABLE":
      return "green";
    case "NEAR_CAPACITY":
      return "pending";
    case "RESTRICTED":
      return "restricted";
    case "CLOSED":
      return "default";
    default:
      return "default";
  }
}

function getProgressClass(status: CapacityDto["status"]): string {
  switch (status) {
    case "AVAILABLE":
      return styles.progressAvailable;
    case "NEAR_CAPACITY":
      return styles.progressNearCapacity;
    case "RESTRICTED":
      return styles.progressRestricted;
    case "CLOSED":
    default:
      return styles.progressClosed;
  }
}

export function DestinationCard({ destination, capacity }: DestinationCardProps) {
  return (
    <Card
      eyebrow={destination.type ?? "Destination"}
      title={destination.name}
      action={
        <StatusPill tone={getAccessTone(destination.access_status)} dot>
          {destination.access_status}
        </StatusPill>
      }
    >
      <div className={styles.cardContent}>
        {destination.description ? (
          <p className={styles.description}>{destination.description}</p>
        ) : null}

        <div className={styles.metaRow}>
          {destination.difficulty ? (
            <span className={styles.metaItem}>
              <Mountain size={14} className={styles.metaIcon} aria-hidden="true" />
              <span>{destination.difficulty}</span>
            </span>
          ) : null}
          {destination.estimated_duration_minutes ? (
            <span className={styles.metaItem}>
              <Clock size={14} className={styles.metaIcon} aria-hidden="true" />
              <span>{destination.estimated_duration_minutes} min</span>
            </span>
          ) : null}
          {destination.elevation ? (
            <span className={styles.metaItem}>
              <MapPin size={14} className={styles.metaIcon} aria-hidden="true" />
              <span>{destination.elevation}m</span>
            </span>
          ) : null}
        </div>

        {capacity ? (
          <div>
            <div className={styles.capacitySummary}>
              <span>Live Capacity ({capacity.percentage}%)</span>
              <StatusPill tone={getCapacityTone(capacity.status)}>
                {capacity.status.replace("_", " ")}
              </StatusPill>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.progressBar} ${getProgressClass(capacity.status)}`}
                style={{ width: `${Math.min(100, Math.max(0, capacity.percentage))}%` }}
              />
            </div>
          </div>
        ) : null}

        <div>
          <Link
            href={`/destinations/${destination.id}`}
            className={styles.ctaButton}
            style={{ width: "100%", marginTop: "8px" }}
          >
            <span>View destination</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
