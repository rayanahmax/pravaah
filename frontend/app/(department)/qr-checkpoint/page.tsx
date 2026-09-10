import type { Metadata } from "next";
import { CameraOff, QrCode, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/department/page-header";

export const metadata: Metadata = { title: "QR Checkpoint" };

export default function QrCheckpointPage() {
  return (
    <div className="checkpoint-page">
      <PageHeader eyebrow="Field checkpoint" title="QR checkpoint" description="A mobile-first preview of the secure validation workflow. Camera and scanning are intentionally unavailable." />
      <section className="checkpoint-card" aria-labelledby="scanner-heading">
        <div className="scanner-frame">
          <QrCode aria-hidden="true" size={72} strokeWidth={1.4} />
          <span className="scanner-corner scanner-corner--tl" /><span className="scanner-corner scanner-corner--tr" /><span className="scanner-corner scanner-corner--bl" /><span className="scanner-corner scanner-corner--br" />
        </div>
        <div className="checkpoint-card__content"><span className="icon-box icon-box--large"><CameraOff aria-hidden="true" size={23} /></span><h2 id="scanner-heading">Scanner unavailable in UI Phase 1</h2><p>No camera access is requested and no QR payload is created or processed.</p><button className="primary-button" type="button" disabled><QrCode aria-hidden="true" size={19} /> Start secure scan</button></div>
      </section>
      <section className="checkpoint-steps" aria-label="Future validation flow"><h2>Validation sequence</h2><ol><li><span>1</span><p><strong>Scan reference</strong><small>Secure token only; no unnecessary PII.</small></p></li><li><span>2</span><p><strong>Server validation</strong><small>Permit, date, destination, and status.</small></p></li><li><span>3</span><p><strong>Confirmed action</strong><small>Transaction-safe check-in or check-out.</small></p></li></ol><div className="notice notice--neutral"><ShieldAlert aria-hidden="true" size={19} /><p><strong>Prototype data — not live</strong><span>This screen demonstrates layout only. Operational validation requires the future server workflow.</span></p></div></section>
    </div>
  );
}
