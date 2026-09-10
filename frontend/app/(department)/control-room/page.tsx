import type { Metadata } from "next";
import { Ban, LockKeyhole, RotateCcw, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";

export const metadata: Metadata = { title: "Control Room" };

const controls = [
  { icon: Settings2, title: "Update capacity", description: "Change destination carrying capacity." },
  { icon: Settings2, title: "Update daily quota", description: "Set the separate permit quota." },
  { icon: Ban, title: "Restrict or close access", description: "Apply a department access override." },
  { icon: RotateCcw, title: "Reopen access", description: "Remove an active access override." },
];

export default function ControlRoomPage() {
  return (
    <>
      <PageHeader eyebrow="Department controls" title="Control room" description="Future operational controls are visible for workflow context but remain disabled in this presentation phase." aside={<span className="status-badge"><LockKeyhole aria-hidden="true" size={15} /> Read-only</span>} />
      <div className="control-grid">{controls.map(({ icon: Icon, title, description }) => <section className="control-card" key={title}><span className="icon-box icon-box--large"><Icon aria-hidden="true" size={22} /></span><div><h2>{title}</h2><p>{description}</p></div><button type="button" disabled>Unavailable in UI Phase 1</button></section>)}</div>
      <section className="panel access-panel" aria-labelledby="access-heading"><div><p className="eyebrow">Current presentation</p><h2 id="access-heading">Destination access</h2><p>Access is shown as available using labeled prototype data. No control on this page changes state.</p></div><span className="status-badge status-badge--green"><span className="status-dot" /> Available</span></section>
      <p className="data-note"><strong>Prototype data — not live.</strong> Server-side authorization and transactional controls are required before these actions can be enabled.</p>
    </>
  );
}
