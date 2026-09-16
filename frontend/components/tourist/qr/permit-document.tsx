import { ShieldCheck } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/tourist/ui";
import { readPermitDetails } from "@/lib/permit-details";
import { describeDay, permitReference } from "@/lib/department-labels";
import type { PermitStatus } from "@/lib/permit-rules";
import type { DestinationRow, PermitRow } from "@/types/rows";
import styles from "./permit-document.module.css";

// Government-permit vocabulary: the internal state machine maps onto the labels
// an officer would print on the pass.
const DOC_STATUS: Record<PermitStatus, { label: string; tone: PillTone }> = {
  PENDING: { label: "Pending", tone: "pending" },
  APPROVED: { label: "Confirmed", tone: "green" },
  CHECKED_IN: { label: "Active", tone: "green" },
  COMPLETED: { label: "Completed", tone: "green" },
  REJECTED: { label: "Not approved", tone: "restricted" },
  RESTRICTED: { label: "Restricted", tone: "restricted" },
  CANCELLED: { label: "Cancelled", tone: "default" },
  EXPIRED: { label: "Expired", tone: "default" },
};

function text(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value : "—";
}

/**
 * The eco-tourism entry permit certificate. A read-only server rendering of the
 * permit as an official document: authority header, permit id + status, visitor,
 * the group roster (IDs shown masked), visit/vehicle/equipment, and the emergency
 * contact. It reads only the caller's own permit (RLS-scoped upstream) and never
 * re-derives any authoritative value — capacity and status come from the server.
 */
export function PermitDocument({
  permit,
  destination,
  leadName,
  leadPhone,
}: {
  permit: PermitRow;
  destination: DestinationRow | null;
  leadName: string | null;
  leadPhone: string | null;
}) {
  const details = readPermitDetails(permit.permit_details);
  const contact = (permit.contact_information ?? {}) as Record<string, unknown>;
  const address = (contact.address ?? {}) as Record<string, unknown>;
  const emergency = (permit.emergency_contact ?? {}) as Record<string, unknown>;
  const status = DOC_STATUS[permit.status];

  const name = text(contact.fullName) !== "—" ? String(contact.fullName) : text(leadName);
  const phone = text(contact.phone) !== "—" ? String(contact.phone) : text(leadPhone);
  const addressLine = [address.line, address.district, address.state].filter(Boolean).join(", ");

  const roster = [
    {
      name,
      age: details.lead.age,
      nationality: details.lead.nationality,
      idType: details.lead.idType,
      idNumberMasked: details.lead.idNumberMasked,
    },
    ...details.members,
  ];

  return (
    <article className={styles.doc} aria-label="Eco-tourism entry permit">
      <div className={styles["doc__band"]}>
        <span className={styles["doc__emblem"]}><ShieldCheck size={22} aria-hidden="true" /></span>
        <div className={styles["doc__authority"]}>
          <strong>Forest Department · Wildlife Division</strong>
          <span>{destination?.name ?? "Protected Area"}</span>
        </div>
        <div className={styles["doc__title"]}>
          <strong>ECO-TOURISM ENTRY PERMIT</strong>
          <span>PRAVAAH regulated access</span>
        </div>
      </div>

      <div className={styles["doc__statusbar"]}>
        <span className={styles["doc__id"]}>
          <small>Permit reference</small>
          {permitReference(permit.id)}
        </span>
        <StatusPill tone={status.tone} dot>{status.label}</StatusPill>
      </div>

      <div className={styles["doc__body"]}>
        <section className={styles["doc__section"]}>
          <h3>Visitor</h3>
          <dl className={styles["doc__grid"]}>
            <div className={styles["doc__field"]}><dt>Name</dt><dd>{name}</dd></div>
            <div className={styles["doc__field"]}><dt>Mobile</dt><dd>{phone}</dd></div>
            <div className={styles["doc__field"]}><dt>Email</dt><dd>{text(contact.email)}</dd></div>
            <div className={styles["doc__field"]}><dt>Nationality</dt><dd>{text(details.lead.nationality)}</dd></div>
            <div className={styles["doc__field"]}><dt>Gender</dt><dd>{text(details.lead.gender)}</dd></div>
            <div className={styles["doc__field"]}><dt>Age / DOB</dt><dd>{details.lead.age ?? "—"}{details.lead.dob ? ` · ${details.lead.dob}` : ""}</dd></div>
            <div className={styles["doc__field"]}><dt>ID</dt><dd>{text(details.lead.idType)} {details.lead.idNumberMasked ? `· ${details.lead.idNumberMasked}` : ""}</dd></div>
            <div className={styles["doc__field"]}><dt>Visitors</dt><dd>{permit.group_size}</dd></div>
            <div className={styles["doc__field"]}><dt>Address</dt><dd>{addressLine || "—"}</dd></div>
          </dl>
        </section>

        <section className={styles["doc__section"]}>
          <h3>Group roster</h3>
          <div className={styles["doc__tablewrap"]}>
            <table className={styles["doc__table"]}>
              <thead>
                <tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Age</th><th scope="col">Nationality</th><th scope="col">ID</th></tr>
              </thead>
              <tbody>
                {roster.map((m, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{m.name || "—"}</td>
                    <td>{m.age ?? "—"}</td>
                    <td>{m.nationality || "—"}</td>
                    <td>{m.idType ? `${m.idType} · ${m.idNumberMasked ?? "—"}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles["doc__section"]}>
          <h3>Visit details</h3>
          <dl className={styles["doc__grid"]}>
            <div className={styles["doc__field"]}><dt>Destination</dt><dd>{destination?.name ?? "—"}</dd></div>
            <div className={styles["doc__field"]}><dt>Date of visit</dt><dd>{describeDay(permit.visit_date)} · {permit.visit_date}</dd></div>
            <div className={styles["doc__field"]}><dt>Purpose</dt><dd>{text(contact.purpose)}</dd></div>
            <div className={styles["doc__field"]}><dt>Zone</dt><dd>{text(details.visit.zone)}</dd></div>
            <div className={styles["doc__field"]}><dt>Entry gate</dt><dd>{text(details.visit.entryGate)}</dd></div>
            <div className={styles["doc__field"]}><dt>Exit gate</dt><dd>{text(details.visit.exitGate)}</dd></div>
            <div className={styles["doc__field"]}><dt>Time slot</dt><dd>{text(details.visit.timeSlot)}</dd></div>
            <div className={styles["doc__field"]}><dt>Validity</dt><dd>{details.visit.validityFrom ? `${details.visit.validityFrom} → ${details.visit.validityTo ?? ""}` : "—"}</dd></div>
            <div className={styles["doc__field"]}><dt>Route / area</dt><dd>{text(details.visit.route)}</dd></div>
          </dl>
        </section>

        <section className={styles["doc__section"]}>
          <h3>Vehicle</h3>
          {details.vehicle.required ? (
            <dl className={styles["doc__grid"]}>
              <div className={styles["doc__field"]}><dt>Type</dt><dd>{text(details.vehicle.type)}</dd></div>
              <div className={styles["doc__field"]}><dt>Registration</dt><dd>{text(details.vehicle.registration)}</dd></div>
              <div className={styles["doc__field"]}><dt>Seating</dt><dd>{details.vehicle.seatingCapacity ?? "—"}</dd></div>
              <div className={styles["doc__field"]}><dt>Driver</dt><dd>{text(details.vehicle.driver)}</dd></div>
              <div className={styles["doc__field"]}><dt>Guide</dt><dd>{text(details.vehicle.guide)}</dd></div>
            </dl>
          ) : (
            <p className={styles["doc__empty"]}>No vehicle.</p>
          )}
        </section>

        <section className={styles["doc__section"]}>
          <h3>Camera &amp; equipment</h3>
          <dl className={styles["doc__grid"]}>
            <div className={styles["doc__field"]}><dt>Still camera</dt><dd>{details.equipment.stillCamera ? details.equipment.stillCount ?? "Yes" : "No"}</dd></div>
            <div className={styles["doc__field"]}><dt>Video camera</dt><dd>{details.equipment.videoCamera ? details.equipment.videoCount ?? "Yes" : "No"}</dd></div>
            <div className={styles["doc__field"]}><dt>Special</dt><dd>{text(details.equipment.special)}</dd></div>
          </dl>
        </section>

        <section className={styles["doc__section"]}>
          <h3>Emergency contact</h3>
          <dl className={styles["doc__grid"]}>
            <div className={styles["doc__field"]}><dt>Name</dt><dd>{text(emergency.name)}</dd></div>
            <div className={styles["doc__field"]}><dt>Relationship</dt><dd>{text(emergency.relationship)}</dd></div>
            <div className={styles["doc__field"]}><dt>Phone</dt><dd>{text(emergency.phone)}</dd></div>
          </dl>
        </section>
      </div>

      <div className={styles["doc__foot"]}>
        <ShieldCheck size={14} aria-hidden="true" />
        This permit is issued by the department and is valid only with a matching checkpoint check-in.
        Identification numbers are shown masked. Present the QR code at the gate.
      </div>
    </article>
  );
}
