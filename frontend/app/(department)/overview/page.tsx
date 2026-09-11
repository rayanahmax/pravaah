import type { Metadata } from "next";
import { Activity, ArrowRight, Gauge, TicketCheck, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/department/page-header";
import { StatusCard } from "@/components/department/status-card";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { ActivityFeed } from "@/components/department/activity-feed";
import { AlertsList } from "@/components/department/alerts-list";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeCapacity, formatPercent } from "@/lib/department-labels";
import { resolveActiveDestination } from "@/lib/department";
import { getDepartmentSnapshot } from "@/services/dashboard";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { destinations, destination } = await resolveActiveDestination(await searchParams);
  if (!destination) return <EmptyDestinations />;

  let snapshot;
  try {
    snapshot = await getDepartmentSnapshot(destination);
  } catch (error) {
    console.error("[overview] snapshot failed:", error);
    return <ConsoleError message="Live destination data could not be loaded. Please try again." />;
  }

  const { capacity, quota, pendingCount, activity, alerts } = snapshot;
  const view = describeCapacity(capacity);
  const width = Math.min(100, capacity.percentage);

  return (
    <>
      <PageHeader
        eyebrow="Operations overview"
        title={destination.name}
        description="A live snapshot of destination access, visitor flow, and permit workload, read from the authoritative database."
        aside={
          <div className="header-aside">
            <Badge tone={view.tone}>
              <span className="status-dot" aria-hidden="true" />
              {view.label}
            </Badge>
            <DestinationSwitcher
              destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
              activeId={destination.id}
            />
          </div>
        }
      />

      <section className="metric-grid" aria-label="Key destination metrics">
        <StatusCard label="Current visitors" value={String(capacity.occupancy)} detail={`of ${capacity.capacity} total capacity`} icon={Users} tone="accent" />
        <StatusCard label="Occupancy" value={formatPercent(capacity.percentage)} detail={`${capacity.remaining} places remaining`} icon={Gauge} />
        <StatusCard label="Daily quota" value={quota.quota === null ? "Not set" : String(quota.remaining)} detail={quota.quota === null ? "No quota configured today" : `${quota.visitors_admitted ?? 0} admitted of ${quota.quota}`} icon={Activity} />
        <StatusCard label="Pending permits" value={String(pendingCount)} detail="Awaiting a decision" icon={TicketCheck} />
      </section>

      <div className="content-grid">
        <section className="panel panel--capacity" aria-labelledby="capacity-heading">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Capacity monitoring</p>
              <h2 id="capacity-heading">Visitor load</h2>
            </div>
            <Badge tone={view.tone}>{view.label}</Badge>
          </div>
          <div className="capacity-summary">
            <strong>{capacity.occupancy}</strong>
            <span>visitors currently inside</span>
          </div>
          <div className="progress-track" role="img" aria-label={`Occupancy is ${capacity.percentage} percent of capacity`}>
            <span style={{ width: `${width}%` }} />
          </div>
          <div className="progress-labels">
            <span>0</span>
            <span>Capacity {capacity.capacity}</span>
          </div>
          {view.overrideNote ? <p className="override-note">{view.overrideNote}</p> : null}
          <p className="panel-actions">
            <Link href="/capacity" className="text-link">
              Adjust capacity &amp; quota <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </p>
        </section>

        <section className="panel" aria-labelledby="activity-heading">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Checkpoint</p>
              <h2 id="activity-heading">Recent activity</h2>
            </div>
          </div>
          <ActivityFeed activity={activity} />
        </section>
      </div>

      <section className="panel" aria-labelledby="alerts-heading">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Field safety</p>
            <h2 id="alerts-heading">Active alerts</h2>
          </div>
        </div>
        <AlertsList alerts={alerts} />
      </section>
    </>
  );
}
