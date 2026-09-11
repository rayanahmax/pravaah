import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { CheckpointScanner } from "@/components/department/checkpoint-scanner";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeCapacity, formatPercent } from "@/lib/department-labels";
import { resolveActiveDestination } from "@/lib/department";
import { buildCapacityView } from "@/services/capacity";
import { LiveRefresh } from "@/components/department/live-refresh";

export const metadata: Metadata = { title: "QR Checkpoint" };

const LIVE_TABLES = ["check_ins", "check_outs", "permits", "capacity_configurations", "destinations"];

const STEPS = [
  { title: "Scan reference", detail: "An opaque token only; no visitor identity is captured." },
  { title: "Server validation", detail: "Permit state, visit date, destination, duplicates and capacity." },
  { title: "Confirmed movement", detail: "A transaction-safe check-in or check-out updates occupancy." },
];

export default async function QrCheckpointPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { destinations, destination } = await resolveActiveDestination(await searchParams);
  if (!destination) return <EmptyDestinations />;

  let capacity;
  try {
    capacity = await buildCapacityView(destination);
  } catch (error) {
    console.error("[qr-checkpoint] capacity read failed:", error);
    return <ConsoleError message="Checkpoint could not confirm the current occupancy. Please try again." />;
  }

  const view = describeCapacity(capacity);

  return (
    <div className="checkpoint-page">
      <LiveRefresh tables={LIVE_TABLES} destinationId={destination.id} />
      <PageHeader
        eyebrow="Field checkpoint"
        title="QR checkpoint"
        description="Process a visitor's permit at the gate. Every accept or reject decision is made by the server, never by this screen."
        aside={
          <div className="header-aside">
            <Badge tone={view.tone}>
              {capacity.occupancy} / {capacity.capacity} · {formatPercent(capacity.percentage)}
            </Badge>
            <DestinationSwitcher
              destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
              activeId={destination.id}
            />
          </div>
        }
      />

      <CheckpointScanner destinationName={destination.name} />

      <section className="checkpoint-steps" aria-label="Validation flow">
        <h2>Validation sequence</h2>
        <ol>
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <p>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </p>
            </li>
          ))}
        </ol>
        <div className="notice notice--neutral">
          <ShieldCheck aria-hidden="true" size={19} />
          <p>
            <strong>Server-authoritative</strong>
            <span>
              Capacity, permit status and duplicate prevention are enforced transactionally in the
              database. This screen presents the outcome and cannot override it.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
