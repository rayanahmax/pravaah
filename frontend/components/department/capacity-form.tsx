"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { apiPatch, type ApiResult } from "@/lib/client-api";
import { CAPACITY_STATUS_LABEL, formatPercent } from "@/lib/department-labels";
import type { CapacityStatus } from "@/lib/capacity";

type CapacityView = {
  capacity: number;
  occupancy: number;
  remaining: number;
  percentage: number;
  status: CapacityStatus;
};

/**
 * Operator capacity write.
 *
 * The field starts from the authoritative stored value, and after saving we show
 * the recomputed view the server returned — never a status the browser asserted.
 * `router.refresh()` then re-renders the page from the database so every figure
 * on the console reflects the change. Lowering capacity below occupancy is a
 * legitimate tightening of access, so the number field carries no artificial
 * minimum beyond "a whole, non-negative number".
 */
export function CapacityForm({
  destinationId,
  currentCapacity,
}: {
  destinationId: string;
  currentCapacity: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(currentCapacity));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ApiResult<CapacityView> | null>(null);

  const parsed = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(parsed) && parsed >= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setResult(null);

    const outcome = await apiPatch<CapacityView>(
      `/api/v1/department/destinations/${destinationId}/capacity`,
      { capacity: parsed }
    );
    setResult(outcome);
    setPending(false);
    if (outcome.ok) router.refresh();
  }

  return (
    <form className="inline-form" onSubmit={onSubmit} noValidate>
      <div className="inline-form__fields">
        <label className="field">
          <span>Maximum capacity</span>
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
          Save capacity
        </button>
      </div>

      {result?.ok ? (
        <p className="form-feedback form-feedback--ok" role="status">
          <CheckCircle2 aria-hidden="true" size={16} />
          Saved. Occupancy {result.data.occupancy} of {result.data.capacity} ({formatPercent(result.data.percentage)}) is {CAPACITY_STATUS_LABEL[result.data.status]}.
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
