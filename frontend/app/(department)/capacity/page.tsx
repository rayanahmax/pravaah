import type { Metadata } from "next";
import { Activity, Gauge, Users } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { StatusCard } from "@/components/department/status-card";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { CapacityForm } from "@/components/department/capacity-form";
import { QuotaForm } from "@/components/department/quota-form";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeCapacity, formatPercent } from "@/lib/department-labels";
import { resolveActiveDestination } from "@/lib/department";
import { buildCapacityView, findCapacityConfiguration } from "@/services/capacity";
import { readQuota } from "@/services/quotas";
import { todayIsoDate } from "@/lib/date";
import { LiveRefresh } from "@/components/department/live-refresh";

export const metadata: Metadata = { title: "Capacity" };

const LIVE_TABLES = [
  "capacity_configurations",
  "daily_quotas",
  "check_ins",
  "check_outs",
  "destinations",
];

export default async function CapacityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { destinations, destination } = await resolveActiveDestination(await searchParams);
  if (!destination) return <EmptyDestinations />;

  const date = todayIsoDate();
  let capacity, configured, quota;
  try {
    [capacity, configured, quota] = await Promise.all([
      buildCapacityView(destination),
      findCapacityConfiguration(destination.id),
      readQuota(destination.id, date),
    ]);
  } catch (error) {
    console.error("[capacity] read failed:", error);
    return <ConsoleError message="Capacity and quota data could not be loaded. Please try again." />;
  }

  const view = describeCapacity(capacity);
  const width = Math.min(100, capacity.percentage);

  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} destinationId={destination.id} />
      <PageHeader
        eyebrow="Capacity monitoring"
        title="Capacity & quota"
        description="Occupancy is derived from checkpoint events; capacity and daily quota are configured separately. Changes are validated and applied server-side, then re-read from the database."
        aside={
          <div className="header-aside">
            <Badge tone={view.tone}>{view.label}</Badge>
            <DestinationSwitcher
              destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
              activeId={destination.id}
            />
          </div>
        }
      />

      <section className="metric-grid metric-grid--three" aria-label="Capacity metrics">
        <StatusCard label="Current occupancy" value={String(capacity.occupancy)} detail="Visitors inside now" icon={Users} tone="accent" />
        <StatusCard label="Total capacity" value={configured ? String(capacity.capacity) : "Not set"} detail={configured ? `${capacity.remaining} places remaining` : "No capacity configured"} icon={Gauge} />
        <StatusCard label="Daily quota" value={quota.quota === null ? "Not set" : String(quota.quota)} detail={`${quota.visitors_admitted ?? 0} admitted today`} icon={Activity} />
      </section>

      <section className="panel" aria-labelledby="occupancy-detail">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Destination load</p>
            <h2 id="occupancy-detail">Occupancy overview</h2>
          </div>
          <Badge tone={view.tone}>{formatPercent(capacity.percentage)} occupied</Badge>
        </div>
        <div className="large-meter">
          <div className="large-meter__value">
            <strong>{capacity.occupancy}</strong>
            <span>/ {capacity.capacity} visitors</span>
          </div>
          <div className="progress-track progress-track--large" role="img" aria-label={`${capacity.occupancy} of ${capacity.capacity} capacity occupied`}>
            <span style={{ width: `${width}%` }} />
          </div>
        </div>
        <dl className="detail-grid">
          <div><dt>Remaining capacity</dt><dd>{capacity.remaining}</dd></div>
          <div><dt>Quota remaining today</dt><dd>{quota.remaining}</dd></div>
          <div><dt>Access status</dt><dd>{view.label}</dd></div>
        </dl>
        {view.overrideNote ? <p className="override-note">{view.overrideNote}</p> : null}
      </section>

      <div className="editor-grid">
        <section className="panel" aria-labelledby="capacity-edit">
          <div className="panel__heading"><div><p className="eyebrow">Carrying capacity</p><h2 id="capacity-edit">Update capacity</h2></div></div>
          <p className="panel__hint">The maximum number of visitors allowed inside at once. Lowering it below current occupancy is how access is tightened.</p>
          <CapacityForm destinationId={destination.id} currentCapacity={configured ? configured.maximum_capacity : 0} />
        </section>

        <section className="panel" aria-labelledby="quota-edit">
          <div className="panel__heading"><div><p className="eyebrow">Permit intake</p><h2 id="quota-edit">Set daily quota</h2></div></div>
          <p className="panel__hint">How many visitors may check in on a given day. It is separate from, and smaller pressure than, physical capacity.</p>
          <QuotaForm destinationId={destination.id} initialDate={date} initialQuota={quota.quota} />
        </section>
      </div>
    </>
  );
}
