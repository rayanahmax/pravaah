import type { Metadata } from "next";
import { Activity, Gauge, Users } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { StatusCard } from "@/components/department/status-card";

export const metadata: Metadata = { title: "Capacity" };

export default function CapacityPage() {
  return (
    <>
      <PageHeader eyebrow="Capacity monitoring" title="Capacity & quota" description="Capacity and daily quota are displayed separately. Values are illustrative and cannot be changed in this phase." />
      <section className="metric-grid metric-grid--three" aria-label="Capacity metrics">
        <StatusCard label="Current occupancy" value="425" detail="Active visitors" icon={Users} tone="accent" />
        <StatusCard label="Total capacity" value="500" detail="75 places remaining" icon={Gauge} />
        <StatusCard label="Daily quota" value="500" detail="Separate from occupancy" icon={Activity} />
      </section>
      <section className="panel" aria-labelledby="occupancy-detail">
        <div className="panel__heading"><div><p className="eyebrow">Destination load</p><h2 id="occupancy-detail">Occupancy overview</h2></div><span className="status-badge">85% occupied</span></div>
        <div className="large-meter"><div className="large-meter__value"><strong>425</strong><span>/ 500 visitors</span></div><div className="progress-track progress-track--large" role="img" aria-label="425 of 500 capacity occupied"><span style={{ width: "85%" }} /></div></div>
        <dl className="detail-grid"><div><dt>Remaining capacity</dt><dd>75</dd></div><div><dt>Daily quota</dt><dd>500</dd></div><div><dt>Access presentation</dt><dd>Near capacity</dd></div></dl>
      </section>
      <p className="data-note"><strong>Prototype data — not live.</strong> No business calculations or authoritative access decisions run in this interface.</p>
    </>
  );
}
