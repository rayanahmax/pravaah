"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { apiPatch, type ApiResult } from "@/lib/client-api";

type QuotaView = {
  destination_id: string;
  date: string;
  quota: number | null;
  visitors_admitted: number | null;
  remaining: number;
};

/**
 * Operator daily-quota write for one destination and day.
 *
 * `visitors_admitted` is intentionally absent: it is derived by the check-in flow
 * and the endpoint rejects it if sent, so this form cannot claim how many people
 * are inside. Saving shows the recomputed remaining the server returned and then
 * refreshes the page from the database.
 */
export function QuotaForm({
  destinationId,
  initialDate,
  initialQuota,
}: {
  destinationId: string;
  initialDate: string;
  initialQuota: number | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [value, setValue] = useState(initialQuota === null ? "" : String(initialQuota));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ApiResult<QuotaView> | null>(null);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setResult(null);

    const outcome = await apiPatch<QuotaView>(
      `/api/v1/department/destinations/${destinationId}/quota`,
      { date, quota: parsed }
    );
    setResult(outcome);
    setPending(false);
    if (outcome.ok) router.refresh();
  }

  return (
    <form className="inline-form" onSubmit={onSubmit} noValidate>
      <div className="inline-form__fields">
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="field">
          <span>Quota</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={result && !result.ok ? true : undefined}
            disabled={pending}
          />
        </label>
        <button type="submit" className="primary-button" disabled={pending || !valid}>
          {pending ? <Loader2 aria-hidden="true" size={18} className="spin" /> : null}
          Save quota
        </button>
      </div>

      {result?.ok ? (
        <p className="form-feedback form-feedback--ok" role="status">
          <CheckCircle2 aria-hidden="true" size={16} />
          {result.data.date}: quota {result.data.quota}, admitted {result.data.visitors_admitted ?? 0}, {result.data.remaining} remaining.
        </p>
      ) : null}
      {result && !result.ok ? (
        <p className="form-feedback form-feedback--error" role="alert">
          <TriangleAlert aria-hidden="true" size={16} />
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
