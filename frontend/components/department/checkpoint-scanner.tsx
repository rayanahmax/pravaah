"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Loader2, QrCode, ScanLine, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { CAPACITY_STATUS_LABEL, formatPercent } from "@/lib/department-labels";
import type { CapacityStatus } from "@/lib/capacity";

type Mode = "check-in" | "check-out";

type CheckInData = {
  check_in: { group_size: number };
  permit: { status: string };
  capacity: { occupancy: number; capacity: number; remaining: number; percentage: number; status: CapacityStatus };
};

type CheckOutData = {
  check_out: { group_size: number };
  permit: { status: string };
  occupancy: { previous: number; current: number; capacity: number | null; remaining: number | null };
};

const ENDPOINT: Record<Mode, string> = {
  "check-in": "/api/v1/checkins",
  "check-out": "/api/v1/checkouts",
};

/**
 * Field checkpoint scanner.
 *
 * An operator enters the token from a scanned permit and chooses check-in or
 * check-out. The server owns every decision — permit state, date, destination,
 * duplicates, capacity — so this screen never validates a permit's legitimacy
 * itself, it just presents the outcome of the transactional RPC and refreshes the
 * console so occupancy elsewhere stays in sync. The input is a paste field rather
 * than a live camera on purpose: camera capture is a separate capability and the
 * token (not a name) is the only thing the workflow ever reads.
 */
export function CheckpointScanner({ destinationName }: { destinationName: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<Mode | null>(null);
  const [outcome, setOutcome] = useState<
    | { mode: Mode; ok: true; summary: string[] }
    | { mode: Mode; ok: false; message: string }
    | null
  >(null);

  const trimmed = token.trim();

  async function submit(mode: Mode) {
    if (pending || !trimmed) return;
    setPending(mode);
    setOutcome(null);

    const result = await apiPost<CheckInData | CheckOutData>(ENDPOINT[mode], { qr_token: trimmed });

    if (result.ok) {
      setOutcome({ mode, ok: true, summary: summarise(mode, result.data) });
      setToken("");
      router.refresh();
    } else {
      setOutcome({ mode, ok: false, message: result.message });
    }
    setPending(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  return (
    <section className="checkpoint-card" aria-labelledby="scanner-heading">
      <div className="scanner-frame">
        <ScanLine aria-hidden="true" size={72} strokeWidth={1.3} />
        <span className="scanner-corner scanner-corner--tl" />
        <span className="scanner-corner scanner-corner--tr" />
        <span className="scanner-corner scanner-corner--bl" />
        <span className="scanner-corner scanner-corner--br" />
      </div>

      <div className="checkpoint-card__content">
        <span className="eyebrow">Active destination</span>
        <h2 id="scanner-heading">{destinationName}</h2>
        <p>Scan or paste a permit token, then confirm the movement. Capacity, permit state and duplicates are enforced on the server.</p>

        <form className="scanner-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Permit token</span>
            <input
              id="permit-token"
              className="token-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="permit-token-hint"
              placeholder="Paste the long code the QR encodes"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={pending !== null}
            />
          </label>

          <p className="scanner-hint" id="permit-token-hint">
            <span>
              The token is the long code the QR encodes. The <code>PRM-…</code> reference on the
              pass only identifies the permit — it is not accepted here.
            </span>
          </p>

          <div className="scanner-form__actions">
            <button type="button" className="primary-button" disabled={pending !== null || !trimmed} onClick={() => submit("check-in")}>
              {pending === "check-in" ? <Loader2 aria-hidden="true" size={18} className="spin" /> : <ArrowDownToLine aria-hidden="true" size={18} />}
              {pending === "check-in" ? "Checking in…" : "Check in"}
            </button>
            <button type="button" className="secondary-button" disabled={pending !== null || !trimmed} onClick={() => submit("check-out")}>
              {pending === "check-out" ? <Loader2 aria-hidden="true" size={18} className="spin" /> : <ArrowUpFromLine aria-hidden="true" size={18} />}
              {pending === "check-out" ? "Checking out…" : "Check out"}
            </button>
          </div>
        </form>

        {outcome ? (
          <div className={`scan-result scan-result--${outcome.ok ? "ok" : "error"}`} role={outcome.ok ? "status" : "alert"}>
            {outcome.ok ? <CheckCircle2 aria-hidden="true" size={18} /> : <TriangleAlert aria-hidden="true" size={18} />}
            <div>
              <strong>
                {outcome.mode === "check-in" ? "Checked in" : "Checked out"}
                {outcome.ok ? "" : " — refused"}
              </strong>
              {outcome.ok ? (
                <ul>{outcome.summary.map((line) => <li key={line}>{line}</li>)}</ul>
              ) : (
                <p>{outcome.message}</p>
              )}
            </div>
          </div>
        ) : null}

        <p className="scanner-hint">
          <QrCode aria-hidden="true" size={14} />
          Tokens are opaque references. No visitor identity is entered or shown here.
        </p>
      </div>
    </section>
  );
}

function summarise(mode: Mode, data: CheckInData | CheckOutData): string[] {
  if (mode === "check-in") {
    const d = data as CheckInData;
    return [
      `Group of ${d.check_in.group_size} admitted · permit ${d.permit.status.toLowerCase().replace("_", " ")}`,
      `Occupancy now ${d.capacity.occupancy} of ${d.capacity.capacity} (${formatPercent(d.capacity.percentage)}, ${CAPACITY_STATUS_LABEL[d.capacity.status]})`,
    ];
  }
  const d = data as CheckOutData;
  const remaining = d.occupancy.remaining === null ? "" : ` · ${d.occupancy.remaining} places free`;
  return [
    `Group of ${d.check_out.group_size} released · permit ${d.permit.status.toLowerCase()}`,
    `Occupancy ${d.occupancy.previous} → ${d.occupancy.current}${remaining}`,
  ];
}
