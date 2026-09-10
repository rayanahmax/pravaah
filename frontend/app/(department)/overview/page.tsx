import type { Metadata } from "next";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Gauge, TicketCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";
import { StatusCard } from "@/components/department/status-card";

export const metadata: Metadata = { title: "Overview" };

const activity = [
  { icon: ArrowDownToLine, title: "Checkpoint entry recorded", ref: "Permit PRM-•••-184", time: "08:42" },
  { icon: TicketCheck, title: "Permit review queued", ref: "Permit PRM-•••-219", time: "08:31" },
  { icon: ArrowUpFromLine, title: "Checkpoint exit recorded", ref: "Permit PRM-•••-097", time: "08:16" },
];

export default function OverviewPage() {
  return (
    <>
      <PageHeader eyebrow="Operations overview" title="Good morning, Operator" description="A read-only snapshot of destination access, visitor flow, and permit workload." aside={<span className="status-badge status-badge--green"><span className="status-dot" /> Access available</span>} />
      <section className="metric-grid" aria-label="Key destination metrics">
        <StatusCard label="Current visitors" value="425" detail="of 500 total capacity" icon={Users} tone="accent" />
        <StatusCard label="Occupancy" value="85%" detail="75 places remaining" icon={Gauge} />
        <StatusCard label="Daily quota" value="500" detail="Configured daily limit" icon={Activity} />
        <StatusCard label="Pending permits" value="12" detail="Prototype queue" icon={TicketCheck} />
      </section>
      <div className="content-grid">
        <section className="panel panel--capacity" aria-labelledby="capacity-heading">
          <div className="panel__heading"><div><p className="eyebrow">Capacity monitoring</p><h2 id="capacity-heading">Visitor load</h2></div><span className="status-badge">Near capacity</span></div>
          <div className="capacity-summary"><strong>425</strong><span>visitors currently inside</span></div>
          <div className="progress-track" role="img" aria-label="Occupancy is 85 percent of capacity"><span style={{ width: "85%" }} /></div>
          <div className="progress-labels"><span>0</span><span>Capacity 500</span></div>
          <div className="notice"><Activity aria-hidden="true" size={19} /><p><strong>Monitor visitor flow</strong><span>Occupancy is within the documented near-capacity band. This label is prototype presentation only.</span></p></div>
        </section>
        <section className="panel" aria-labelledby="activity-heading">
          <div className="panel__heading"><div><p className="eyebrow">Checkpoint</p><h2 id="activity-heading">Recent activity</h2></div><span className="muted-label">Sample events</span></div>
          <ul className="activity-list">
            {activity.map(({ icon: Icon, title, ref, time }) => <li key={`${ref}-${time}`}><span className="activity-icon"><Icon aria-hidden="true" size={18} /></span><span><strong>{title}</strong><small>{ref}</small></span><time>{time}</time></li>)}
          </ul>
        </section>
      </div>
    </>
  );
}
