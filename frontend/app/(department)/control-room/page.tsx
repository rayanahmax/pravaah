import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, LockKeyhole, Megaphone, QrCode, TicketCheck } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { ActivityFeed } from "@/components/department/activity-feed";
import { AlertsList } from "@/components/department/alerts-list";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeCapacity } from "@/lib/department-labels";
import { resolveActiveDestination } from "@/lib/department";
import { getDepartmentSnapshot } from "@/services/dashboard";

export const metadata: Metadata = { title: "Control Room" };

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
  try {
    snapshot = await getDepartmentSnapshot(destination);
  } catch (error) {
    console.error("[control-room] snapshot failed:", error);
    return <ConsoleError message="Operational data could not be loaded. Please try again." />;
  }

  const view = describeCapacity(snapshot.capacity);
  const closed = snapshot.capacity.status === "CLOSED";

  return (
    <>
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
              <h2 id="alerts-heading">Active alerts</h2>
            </div>
            <span className="muted-label"><Megaphone aria-hidden="true" size={14} /> {snapshot.alerts.length}</span>
          </div>
          <AlertsList alerts={snapshot.alerts} />
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

      <section className="panel access-panel" aria-labelledby="access-heading">
        <div>
          <p className="eyebrow">Access state</p>
          <h2 id="access-heading">{destination.name}</h2>
          <p>
            Occupancy {snapshot.capacity.occupancy} of {snapshot.capacity.capacity} is reported as{" "}
            {view.label.toLowerCase()}.
            {view.overrideNote ? ` ${view.overrideNote}.` : ""}
          </p>
        </div>
        <div className="access-panel__side">
          <Badge tone={view.tone}>{view.label}</Badge>
          <p className="override-hint">
            <LockKeyhole aria-hidden="true" size={14} />
            {closed ? "Access is currently closed." : "Manual close / reopen is scheduled with department access controls (Phase 11)."}
          </p>
        </div>
      </section>
    </>
  );
}
