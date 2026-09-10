import type { Metadata } from "next";
import { Clock3, FileSearch, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";

export const metadata: Metadata = { title: "Permits" };

const permits = [
  { reference: "PRM-•••-219", status: "Pending", visit: "Today", submitted: "08:31" },
  { reference: "PRM-•••-184", status: "Approved", visit: "Today", submitted: "07:55" },
  { reference: "PRM-•••-163", status: "Restricted", visit: "Tomorrow", submitted: "Yesterday" },
  { reference: "PRM-•••-141", status: "Completed", visit: "Yesterday", submitted: "2 days ago" },
];

export default function PermitsPage() {
  return (
    <>
      <PageHeader eyebrow="Permit status tracker" title="Permit queue" description="Review a privacy-preserving presentation of permit references and their current prototype states." aside={<span className="status-badge"><Clock3 aria-hidden="true" size={15} /> 12 pending</span>} />
      <section className="panel table-panel" aria-labelledby="permit-list-heading">
        <div className="panel__heading"><div><p className="eyebrow">Current queue</p><h2 id="permit-list-heading">Permit references</h2></div><span className="muted-label">Generic references only</span></div>
        <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Visit</th><th>Submitted</th><th>Status</th></tr></thead><tbody>{permits.map((permit) => <tr key={permit.reference}><td><span className="reference"><FileSearch aria-hidden="true" size={17} />{permit.reference}</span></td><td>{permit.visit}</td><td>{permit.submitted}</td><td><span className={`status-badge status-badge--${permit.status.toLowerCase()}`}>{permit.status === "Approved" && <ShieldCheck aria-hidden="true" size={14} />}{permit.status}</span></td></tr>)}</tbody></table></div>
      </section>
      <p className="data-note"><strong>Prototype data — not live.</strong> Permit decisions are not available in UI Phase 1.</p>
    </>
  );
}
