"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Info, Loader2, Megaphone, Plus, Trash2, TriangleAlert } from "lucide-react";
import { apiGet, apiPost } from "@/lib/client-api";
import { StatusPill, type PillTone } from "@/components/tourist/ui";
import { CAPACITY_STATUS_LABEL } from "@/lib/department-labels";
import { GENDERS, ID_TYPES } from "@/lib/permit-details";
import type {
  CapacityStatus,
  DestinationDetailResponse,
  PermitCreateRequest,
  PermitDto,
} from "@/types/tourist";
import styles from "./permits.module.css";

const PURPOSES = ["Eco-tourism", "Safari", "Trek", "Research", "Photography", "Other"] as const;

type MemberRow = { name: string; age: string; nationality: string; idType: string; idNumber: string };
const emptyMember = (): MemberRow => ({ name: "", age: "", nationality: "Indian", idType: "Aadhaar", idNumber: "" });

function statusTone(status: CapacityStatus): PillTone {
  if (status === "AVAILABLE") return "green";
  if (status === "NEAR_CAPACITY") return "pending";
  return "restricted";
}

/**
 * Permit request form — the government-style eco-tourism application.
 *
 * It collects the applicant (identity from the profile where available), the
 * visit, the group roster, optional vehicle and camera details, an emergency
 * contact, and a rules consent. Capacity, occupancy, quota, access status and
 * alerts are fetched from the server and shown read-only; the tourist never
 * enters an authoritative value, and eligibility is decided server-side in a
 * transaction (AGENTS.md rules 6-7). Government ID numbers are collected for
 * realism but masked to the last four server-side; no Aadhaar/PAN/bank/medical
 * data beyond that masked reference is stored.
 */
export function PermitRequestForm({
  destinations,
  defaultDestinationId,
  today,
  applicant,
}: {
  destinations: { id: string; name: string }[];
  defaultDestinationId?: string;
  today: string;
  applicant: { fullName: string | null; phone: string | null };
}) {
  const router = useRouter();

  const [destinationId, setDestinationId] = useState(defaultDestinationId ?? destinations[0]?.id ?? "");
  const [visitDate, setVisitDate] = useState(today);
  const [purpose, setPurpose] = useState("");

  const [fullName, setFullName] = useState(applicant.fullName ?? "");
  const [phone, setPhone] = useState(applicant.phone ?? "");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [nationality, setNationality] = useState("Indian");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [idType, setIdType] = useState("Aadhaar");
  const [idNumber, setIdNumber] = useState("");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [vehicleRequired, setVehicleRequired] = useState(false);
  const [vehicleType, setVehicleType] = useState("");
  const [registration, setRegistration] = useState("");
  const [seating, setSeating] = useState("");
  const [driver, setDriver] = useState("");
  const [guide, setGuide] = useState("");
  const [stillCamera, setStillCamera] = useState(false);
  const [stillCount, setStillCount] = useState("1");
  const [videoCamera, setVideoCamera] = useState(false);
  const [videoCount, setVideoCount] = useState("1");
  const [special, setSpecial] = useState("");

  const [emgName, setEmgName] = useState("");
  const [emgRelationship, setEmgRelationship] = useState("");
  const [emgPhone, setEmgPhone] = useState("");

  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [availability, setAvailability] = useState<DestinationDetailResponse["data"] | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!destinationId || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
        setAvailability(null);
        return;
      }
      setAvailabilityLoading(true);
      const result = await apiGet<DestinationDetailResponse["data"]>(
        `/api/v1/destinations/${destinationId}?date=${visitDate}`
      );
      if (!active) return;
      setAvailability(result.ok ? result.data : null);
      setAvailabilityLoading(false);
    }

    load();
    return () => { active = false; };
  }, [destinationId, visitDate]);

  const groupSize = 1 + members.filter((m) => m.name.trim() !== "").length;
  const ageNum = Number(age);
  const digits = (v: string) => v.replace(/\D/g, "");
  const needName = !applicant.fullName;
  const needPhone = !applicant.phone;
  const emailOk = email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const valid =
    destinationId !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(visitDate) &&
    visitDate >= today &&
    fullName.trim() !== "" &&
    digits(phone).length >= 7 &&
    state.trim() !== "" &&
    district.trim() !== "" &&
    addressLine.trim() !== "" &&
    emailOk &&
    Number.isInteger(ageNum) && ageNum >= 1 && ageNum <= 120 &&
    idType !== "" && idNumber.trim() !== "" &&
    members.every((m) => m.name.trim() !== "" || (m.age === "" && m.idNumber.trim() === "")) &&
    emgName.trim() !== "" && emgRelationship.trim() !== "" && digits(emgPhone).length >= 7 &&
    consent;

  function updateMember(index: number, patch: Partial<MemberRow>) {
    setMembers((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setError(null);

    const contact: PermitCreateRequest["contact_information"] = {
      address: { state: state.trim(), district: district.trim(), line: addressLine.trim() },
    };
    if (email.trim()) contact.email = email.trim();
    if (purpose) contact.purpose = purpose;
    if (needName) contact.fullName = fullName.trim();
    if (needPhone) contact.phone = phone.trim();

    const body: PermitCreateRequest = {
      destination_id: destinationId,
      visit_date: visitDate,
      group_size: groupSize,
      contact_information: contact,
      emergency_contact: {
        name: emgName.trim(),
        relationship: emgRelationship.trim(),
        phone: emgPhone.trim(),
      },
      permit_details: {
        lead: { nationality, gender, dob, age: ageNum, idType, idNumber },
        members: members
          .filter((m) => m.name.trim() !== "")
          .map((m) => ({
            name: m.name.trim(),
            age: m.age === "" ? null : Number(m.age),
            nationality: m.nationality,
            idType: m.idType,
            idNumber: m.idNumber,
          })),
        vehicle: { required: vehicleRequired, type: vehicleType, registration, seatingCapacity: seating, driver, guide },
        equipment: { stillCamera, stillCount, videoCamera, videoCount, special },
      },
    };

    const result = await apiPost<PermitDto>("/api/v1/permits", body);
    setPending(false);

    if (result.ok) {
      router.push(`/my-permits/${result.data.id}`);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  if (destinations.length === 0) {
    return (
      <p className={styles["feedback feedback--error"]} role="alert">
        <TriangleAlert aria-hidden="true" size={16} />
        There are no destinations available to request a permit for yet.
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {/* Applicant */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Applicant details</h2>
        <p className={styles["section__note"]}>
          Name and phone come from your account when available. We collect a government ID only as
          a masked reference (last four digits). No financial or medical data is taken.
        </p>
        <div className={styles["form__grid"]}>
          <label className={styles.field}>
            <span>Full name *</span>
            {needName ? (
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pending} autoComplete="name" />
            ) : (
              <span className={styles.readonly}>{applicant.fullName}<span className={styles["readonly__tag"]}>From account</span></span>
            )}
          </label>
          <label className={styles.field}>
            <span>Mobile number *</span>
            {needPhone ? (
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={pending} autoComplete="tel" />
            ) : (
              <span className={styles.readonly}>{applicant.phone}<span className={styles["readonly__tag"]}>From account</span></span>
            )}
          </label>
          <label className={styles.field}>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} placeholder="Optional" />
          </label>
          <label className={styles.field}>
            <span>Nationality *</span>
            <input value={nationality} onChange={(e) => setNationality(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>Gender</span>
            <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={pending}>
              <option value="">Select (optional)</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Date of birth</span>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} disabled={pending} max={today} />
          </label>
          <label className={styles.field}>
            <span>Age *</span>
            <input type="number" inputMode="numeric" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>Government ID type *</span>
            <select value={idType} onChange={(e) => setIdType(e.target.value)} disabled={pending}>
              {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Government ID number *</span>
            <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} disabled={pending} inputMode="text" autoComplete="off" />
            <span className={styles["field__hint"]}>Stored masked — only the last four digits are kept.</span>
          </label>
          <label className={`${styles.field} ${styles["field--full"]}`}>
            <span>Address line *</span>
            <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} disabled={pending} autoComplete="street-address" />
          </label>
          <label className={styles.field}>
            <span>District / City *</span>
            <input value={district} onChange={(e) => setDistrict(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>State *</span>
            <input value={state} onChange={(e) => setState(e.target.value)} disabled={pending} />
          </label>
        </div>
      </section>

      {/* Visit details */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Visit details</h2>
        <div className={styles["form__grid"]}>
          <label className={`${styles.field} ${styles["field--full"]}`}>
            <span>Destination *</span>
            <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} disabled={pending}>
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Visit date *</span>
            <input type="date" value={visitDate} min={today} onChange={(e) => setVisitDate(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>Purpose of visit</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={pending}>
              <option value="">Select (optional)</option>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <div className={styles.availability} aria-live="polite">
          <div className={styles["availability__head"]}>
            <p className={styles["availability__title"]}>Availability &amp; conditions</p>
            {availability ? (
              <StatusPill tone={statusTone(availability.capacity.status)} dot>{CAPACITY_STATUS_LABEL[availability.capacity.status]}</StatusPill>
            ) : availabilityLoading ? (
              <span className={styles["availability__spin"]}><Loader2 aria-hidden="true" size={14} className="spin" /> Checking…</span>
            ) : null}
          </div>
          {availability ? (
            <dl className={styles["availability__grid"]}>
              <div className={styles["availability__stat"]}><dt>Occupancy</dt><dd>{availability.capacity.occupancy} / {availability.capacity.capacity}</dd></div>
              <div className={styles["availability__stat"]}><dt>Places left</dt><dd>{availability.capacity.remaining}</dd></div>
              <div className={styles["availability__stat"]}><dt>Quota left</dt><dd>{availability.quota.quota === null ? "Not set" : availability.quota.remaining}</dd></div>
              <div className={styles["availability__stat"]}><dt>Alerts</dt><dd>{availability.alerts.length}</dd></div>
            </dl>
          ) : !availabilityLoading ? (
            <p className={styles["availability__muted"]}>Retrieved automatically for the selected destination and date.</p>
          ) : null}
          {availability && availability.alerts.length > 0 ? (
            <div className={styles["availability__alerts"]}>
              {availability.alerts.slice(0, 3).map((a) => (
                <p key={a.id} className={styles["availability__alert"]}><Megaphone aria-hidden="true" size={14} /> {a.title}</p>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* Group members */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Group members</h2>
        <p className={styles["section__note"]}>
          You are visitor 1. Add each additional visitor. Total visitors: <strong>{groupSize}</strong>.
        </p>
        {members.map((m, i) => (
          <div key={i} className={styles.member}>
            <div className={styles["form__grid"]}>
              <label className={styles.field}>
                <span>Visitor {i + 2} name *</span>
                <input value={m.name} onChange={(e) => updateMember(i, { name: e.target.value })} disabled={pending} />
              </label>
              <label className={styles.field}>
                <span>Age</span>
                <input type="number" min={0} max={120} value={m.age} onChange={(e) => updateMember(i, { age: e.target.value })} disabled={pending} />
              </label>
              <label className={styles.field}>
                <span>Nationality</span>
                <input value={m.nationality} onChange={(e) => updateMember(i, { nationality: e.target.value })} disabled={pending} />
              </label>
              <label className={styles.field}>
                <span>ID type</span>
                <select value={m.idType} onChange={(e) => updateMember(i, { idType: e.target.value })} disabled={pending}>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>ID number</span>
                <input value={m.idNumber} onChange={(e) => updateMember(i, { idNumber: e.target.value })} disabled={pending} autoComplete="off" />
              </label>
            </div>
            <button type="button" className={`${styles.ghostBtn} ${styles.dangerBtn}`} onClick={() => setMembers((rows) => rows.filter((_, j) => j !== i))} disabled={pending}>
              <Trash2 aria-hidden="true" size={15} /> Remove
            </button>
          </div>
        ))}
        <div>
          <button type="button" className={styles.ghostBtn} onClick={() => setMembers((rows) => [...rows, emptyMember()])} disabled={pending}>
            <Plus aria-hidden="true" size={15} /> Add visitor
          </button>
        </div>
      </section>

      {/* Vehicle */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Vehicle</h2>
        <label className={styles.consent}>
          <input type="checkbox" checked={vehicleRequired} onChange={(e) => setVehicleRequired(e.target.checked)} disabled={pending} />
          <span>Bringing a vehicle into the protected area</span>
        </label>
        {vehicleRequired ? (
          <div className={styles["form__grid"]}>
            <label className={styles.field}><span>Vehicle type</span><input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} disabled={pending} placeholder="e.g. Jeep" /></label>
            <label className={styles.field}><span>Registration number</span><input value={registration} onChange={(e) => setRegistration(e.target.value)} disabled={pending} /></label>
            <label className={styles.field}><span>Seating capacity</span><input type="number" min={1} value={seating} onChange={(e) => setSeating(e.target.value)} disabled={pending} /></label>
            <label className={styles.field}><span>Driver name</span><input value={driver} onChange={(e) => setDriver(e.target.value)} disabled={pending} /></label>
            <label className={styles.field}><span>Guide name / ID</span><input value={guide} onChange={(e) => setGuide(e.target.value)} disabled={pending} /></label>
          </div>
        ) : null}
      </section>

      {/* Equipment */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Camera &amp; equipment</h2>
        <div className={styles["form__grid"]}>
          <div className={styles.field}>
            <span>Still camera</span>
            <label className={styles.consent}><input type="checkbox" checked={stillCamera} onChange={(e) => setStillCamera(e.target.checked)} disabled={pending} /><span>Carrying still camera(s)</span></label>
            {stillCamera ? <input type="number" min={0} value={stillCount} onChange={(e) => setStillCount(e.target.value)} disabled={pending} aria-label="Number of still cameras" /> : null}
          </div>
          <div className={styles.field}>
            <span>Video camera</span>
            <label className={styles.consent}><input type="checkbox" checked={videoCamera} onChange={(e) => setVideoCamera(e.target.checked)} disabled={pending} /><span>Carrying video camera(s)</span></label>
            {videoCamera ? <input type="number" min={0} value={videoCount} onChange={(e) => setVideoCount(e.target.value)} disabled={pending} aria-label="Number of video cameras" /> : null}
          </div>
          <label className={`${styles.field} ${styles["field--full"]}`}>
            <span>Special equipment / drone permission</span>
            <input value={special} onChange={(e) => setSpecial(e.target.value)} disabled={pending} placeholder="Optional" />
          </label>
        </div>
      </section>

      {/* Emergency contact */}
      <section className={styles.section}>
        <h2 className={styles["section__title"]}>Emergency contact</h2>
        <div className={styles["form__grid"]}>
          <label className={styles.field}><span>Name *</span><input value={emgName} onChange={(e) => setEmgName(e.target.value)} disabled={pending} /></label>
          <label className={styles.field}><span>Relationship *</span><input value={emgRelationship} onChange={(e) => setEmgRelationship(e.target.value)} disabled={pending} placeholder="e.g. Brother" /></label>
          <label className={styles.field}><span>Phone *</span><input type="tel" value={emgPhone} onChange={(e) => setEmgPhone(e.target.value)} disabled={pending} /></label>
        </div>
      </section>

      {/* Readiness (separate, advisory) */}
      <section className={styles.section}>
        <p className={styles["availability__muted"]}>
          <Info aria-hidden="true" size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> A rule-based readiness check (advisory, never a medical fitness declaration) is a separate step and is not part of this form.
        </p>
      </section>

      {/* Consent */}
      <section className={styles.section}>
        <label className={styles.consent}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={pending} />
          <span>I confirm the information provided is accurate and I agree to follow the destination&apos;s safety, environmental and access rules.</span>
        </label>
      </section>

      {error ? (
        <p className={styles["feedback feedback--error"]} role="alert">
          <TriangleAlert aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}

      <div>
        <button type="submit" className={styles.submit} disabled={pending || !valid}>
          {pending ? <Loader2 aria-hidden="true" size={18} className="spin" /> : <ArrowRight aria-hidden="true" size={18} />}
          {pending ? "Submitting…" : "Submit permit request"}
        </button>
        {!valid && !pending ? <p className={styles["section__note"]}>Complete the required (*) fields and accept the rules to submit.</p> : null}
      </div>
    </form>
  );
}
