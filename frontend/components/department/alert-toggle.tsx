"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import { apiPatch } from "@/lib/client-api";
import type { AlertRow } from "@/types/rows";

/**
 * Activate or deactivate one alert (PRD §16).
 *
 * The only mutation offered on an existing alert, on purpose: PRD §16 gives
 * operators create, activate and deactivate, and a safety notice already on a
 * visitor's screen must not be rewritable in place. Correcting one means switching
 * it off and raising a new one, which leaves a visible event behind.
 *
 * Sends `{ active }` and nothing else, then `router.refresh()` so the row is
 * re-read from Postgres — the button does not optimistically flip its own label,
 * because the server's answer is the only one that says whether RLS allowed it.
 */
export function AlertToggle({ alert }: { alert: AlertRow }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextActive = !alert.active;

  async function toggle() {
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await apiPatch<AlertRow>(`/api/v1/department/alerts/${alert.id}`, {
      active: nextActive,
    });

    if (result.ok) {
      // Refresh from the database rather than trusting the response body to
      // repaint the row: the same refresh also updates the tourist-facing count.
      router.refresh();
      setPending(false);
      return;
    }

    setPending(false);
    setError(result.message);
  }

  return (
    <span className="alert-toggle">
      <button
        type="button"
        className="action-btn"
        onClick={toggle}
        disabled={pending}
        aria-label={nextActive ? "Re-activate this alert" : "Deactivate this alert"}
      >
        {pending ? (
          <Loader2 aria-hidden="true" size={14} className="spin" />
        ) : nextActive ? (
          <Power aria-hidden="true" size={14} />
        ) : (
          <PowerOff aria-hidden="true" size={14} />
        )}
        {nextActive ? "Activate" : "Deactivate"}
      </button>
      {error ? (
        <span className="alert-toggle__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
