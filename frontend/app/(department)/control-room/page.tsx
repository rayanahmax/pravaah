import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, Megaphone, QrCode, TicketCheck } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { ActivityFeed } from "@/components/department/activity-feed";
import { AlertsList } from "@/components/department/alerts-list";
import { AlertForm } from "@/components/department/alert-form";
import { AccessControls } from "@/components/department/access-controls";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeCapacity } from "@/lib/department-labels";
import { alertState } from "@/lib/alert-rules";
import { resolveActiveDestination } from "@/lib/department";
import { getDepartmentSnapshot } from "@/services/dashboard";
import { listAllForDestination } from "@/services/alerts";
import { LiveRefresh } from "@/components/department/live-refresh";

export const metadata: Metadata = { title: "Control Room" };

const LIVE_TABLES = [
  "check_ins",
  "check_outs",
  "permits",
  "alerts",
  "capacity_configurations",
  "daily_quotas",
  "destinations",
];

const CONTROLS = [
  { href: "/capacity", icon: Gauge, title: "Capacity & quota", description: "Set carrying capacity and the daily permit intake for this destination." },
  { href: "/permits", icon: TicketCheck, title: "Review permits", description: "Approve, restrict or reject pending requests against live capacity." },
  { href: "/qr-checkpoint", icon: QrCode, title: "Field checkpoint", description: "Check visitors in and out; occupancy updates transactionally." },
];

export default async function ControlRoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { destinations, destination } = await resolveActiveDestination(await searchParams);
  if (!destination) return <EmptyDestinations />;

  let snapshot;
  let alerts;
  const now = new Date();
  try {
    [snapshot, alerts] = await Promise.all([
      getDepartmentSnapshot(destination),
      // The management view needs rows that are NOT displaying, which the
      // snapshot's active-only read deliberately hides.
      listAllForDestination(destination.id),
    ]);
  } catch (error) {
    console.error("[control-room] snapshot failed:", error);
    return <ConsoleError message="Operational data could not be loaded. Please try again." />;
  }

  const liveCount = alerts.filter((alert) => alertState(alert, now) === "ACTIVE").length;

  const view = describeCapacity(snapshot.capacity);
  const overrideLabel = destination.access_status.charAt(0) + destination.access_status.slice(1).toLowerCase();

  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} destinationId={destination.id} />
      <PageHeader
        eyebrow="Department controls"
        title="Control room"
        description="The operational hub for this destination: current access state, active alerts, and live checkpoint activity, with each control acting through the server."
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

      <div className="control-grid">
        {CONTROLS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="control-card control-card--link">
            <span className="icon-box icon-box--large"><Icon aria-hidden="true" size={22} /></span>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <ArrowRight className="control-card__arrow" aria-hidden="true" size={18} />
          </Link>
        ))}
      </div>

      <div className="content-grid">
        <section className="panel" aria-labelledby="alerts-heading">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Field safety</p>
              <h2 id="alerts-heading">Destination alerts</h2>
            </div>
            <span className="muted-label">
              <Megaphone aria-hidden="true" size={14} /> {liveCount} live · {alerts.length} total
            </span>
          </div>
          <p className="panel__hint">
            Notices raised here appear to visitors on this destination&apos;s page while they are
            live. Alerts are informational: they never change access status, capacity or quota.
          </p>
          <AlertForm destinationId={destination.id} />
          <div className="alert-manage">
            <AlertsList alerts={alerts} now={now} manage />
          </div>
        </section>

        <section className="panel" aria-labelledby="activity-heading">
          <div className="panel__heading">
            <div>
              <p className="eyebrow">Checkpoint</p>
              <h2 id="activity-heading">Live activity</h2>
            </div>
          </div>
          <ActivityFeed activity={snapshot.activity} />
        </section>
      </div>

      <section className="panel" aria-labelledby="access-heading">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Access control</p>
            <h2 id="access-heading">Department access override</h2>
          </div>
          <Badge tone={view.tone}>{view.label}</Badge>
        </div>
        <p className="panel__hint">
          Current override is <strong>{overrideLabel}</strong>. Occupancy {snapshot.capacity.occupancy}{" "}
          of {snapshot.capacity.capacity} is reported as {view.label.toLowerCase()}.
          {view.overrideNote ? ` ${view.overrideNote}.` : ""}
        </p>
        <AccessControls destinationId={destination.id} currentStatus={destination.access_status} />
      </section>
    </>
  );
}
