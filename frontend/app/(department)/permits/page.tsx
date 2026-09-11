import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { Badge } from "@/components/department/badge";
import { DestinationSwitcher } from "@/components/department/destination-switcher";
import { PermitActions } from "@/components/department/permit-actions";
import { ConsoleError, EmptyDestinations } from "@/components/department/console-states";
import { describeDay, permitBadge, permitReference } from "@/lib/department-labels";
import { resolveActiveDestination } from "@/lib/department";
import { listOperatorPermits } from "@/services/permits";
import { LiveRefresh } from "@/components/department/live-refresh";
import type { PermitStatus } from "@/lib/permit-rules";

export const metadata: Metadata = { title: "Permits" };

const LIVE_TABLES = ["permits", "capacity_configurations", "daily_quotas", "destinations"];

const FILTERS: { value: string; label: string; status?: PermitStatus }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending", status: "PENDING" },
  { value: "APPROVED", label: "Approved", status: "APPROVED" },
  { value: "RESTRICTED", label: "Restricted", status: "RESTRICTED" },
  { value: "CHECKED_IN", label: "Checked in", status: "CHECKED_IN" },
  { value: "COMPLETED", label: "Completed", status: "COMPLETED" },
];

/**
 * The department permit review queue. Rows are identified by the shared
 * `permitReference` label rather than a full UUID or owner identity (API rule 4);
 * every decision is made by the server through the review endpoints.
 */
export default async function PermitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { destinations, destination } = await resolveActiveDestination(params);
  if (!destination) return <EmptyDestinations />;

  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const active = FILTERS.find((f) => f.value === rawStatus);
  const status = active?.status;

  let permits;
  try {
    permits = await listOperatorPermits({ destinationId: destination.id, status });
  } catch (error) {
    console.error("[permits] read failed:", error);
    return <ConsoleError message="The permit queue could not be loaded. Please try again." />;
  }

  const destinationParam = `destination=${encodeURIComponent(destination.id)}`;

  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} destinationId={destination.id} />
      <PageHeader
        eyebrow="Permit status tracker"
        title="Permit queue"
        description="References are shown generically. Every decision is re-checked against current capacity and quota on the server before it is applied."
        aside={
          <div className="header-aside">
            <Badge tone="pending">{permits.length} shown</Badge>
            <DestinationSwitcher
              destinations={destinations.map((d) => ({ id: d.id, name: d.name }))}
              activeId={destination.id}
            />
          </div>
        }
      />

      <div className="filter-tabs" role="group" aria-label="Filter permits by status">
        {FILTERS.map((filter) => {
          const href = filter.value ? `?${destinationParam}&status=${filter.value}` : `?${destinationParam}`;
          const isActive = (rawStatus ?? "") === filter.value;
          return (
            <Link
              key={filter.value || "all"}
              href={href}
              scroll={false}
              aria-current={isActive ? "true" : undefined}
              className="filter-tab"
              data-active={isActive}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <section className="panel table-panel" aria-labelledby="permit-list-heading">
        <div className="panel__heading">
          <div>
            <p className="eyebrow">Current queue</p>
            <h2 id="permit-list-heading">{active?.label ?? "All"} permits</h2>
          </div>
        </div>

        {permits.length === 0 ? (
          <div className="table-empty">
            <Inbox aria-hidden="true" size={26} />
            <p>No permits match this view for {destination.name}.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Visit</th>
                  <th scope="col">Group</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="th-actions">Decision</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((permit) => {
                  const badge = permitBadge(permit.status);
                  return (
                    <tr key={permit.id}>
                      <td><span className="reference">{permitReference(permit.id)}</span></td>
                      <td>{describeDay(permit.visit_date)}</td>
                      <td>{permit.group_size}</td>
                      <td><Badge tone={badge.tone}>{badge.label}</Badge></td>
                      <td className="td-actions">
                        <PermitActions permitId={permit.id} status={permit.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
