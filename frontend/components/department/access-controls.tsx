"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, CheckCircle2, Loader2, ShieldAlert, Unlock, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { CAPACITY_STATUS_LABEL } from "@/lib/department-labels";
import type { CapacityStatus } from "@/lib/capacity";
import type { AccessStatus } from "@/lib/api/validation";

type CapacityView = {
  capacity: number;
  occupancy: number;
  remaining: number;
  percentage: number;
  status: CapacityStatus;
};

type Action = {
  key: "restrict" | "close" | "reopen";
  endpoint: "restrict" | "close" | "open";
  sets: AccessStatus;
  label: string;
  icon: typeof Ban;
  className: string;
};

const ACTIONS: Action[] = [
  { key: "restrict", endpoint: "restrict", sets: "RESTRICTED", label: "Restrict", icon: ShieldAlert, className: "access-btn access-btn--restrict" },
  { key: "close", endpoint: "close", sets: "CLOSED", label: "Close access", icon: Ban, className: "access-btn access-btn--close" },
  { key: "reopen", endpoint: "open", sets: "OPEN", label: "Reopen", icon: Unlock, className: "access-btn access-btn--reopen" },
];

/**
 * Department access override controls (PRD §12).
 *
 * Each button asks the server to move the destination's access status; the
 * engine then re-derives and returns the resulting band, so the badge the
 * operator sees is authoritative, not a label this component chose. The action
 * that matches the current state is disabled, and `router.refresh()` re-renders
 * the console from the database so occupancy, the queue and the tourist-facing
 * detail all agree on the new access state.
 */
export function AccessControls({
  destinationId,
  currentStatus,
}: {
  destinationId: string;
  currentStatus: AccessStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action["key"] | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "ok"; message: string } | { kind: "error"; message: string } | null
  >(null);

  async function run(action: Action) {
    if (pending) return;
    setPending(action.key);
    setFeedback(null);

    const result = await apiPost<CapacityView>(
      `/api/v1/department/destinations/${destinationId}/${action.endpoint}`
    );
    setPending(null);

    if (result.ok) {
      setFeedback({
        kind: "ok",
        message: `Access set to ${action.sets.toLowerCase()}. Reported status: ${CAPACITY_STATUS_LABEL[result.data.status]}.`,
      });
      router.refresh();
    } else {
      setFeedback({ kind: "error", message: `${action.label} failed: ${result.message}` });
    }
  }

  return (
    <div className="access-controls">
      <div className="access-controls__buttons">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const isCurrent = action.sets === currentStatus;
          return (
            <button
              key={action.key}
              type="button"
              className={action.className}
              disabled={pending !== null || isCurrent}
              aria-pressed={isCurrent}
              onClick={() => run(action)}
            >
              {pending === action.key ? (
                <Loader2 aria-hidden="true" size={16} className="spin" />
              ) : (
                <Icon aria-hidden="true" size={16} />
              )}
              {action.label}
            </button>
          );
        })}
      </div>
      <p className="access-controls__note">
        Overrides apply to new permit requests. Visitors already checked in are not affected until
        they check out.
      </p>
      {feedback ? (
        <p
          className={`form-feedback form-feedback--${feedback.kind === "ok" ? "ok" : "error"}`}
          role={feedback.kind === "ok" ? "status" : "alert"}
        >
          {feedback.kind === "ok" ? (
            <CheckCircle2 aria-hidden="true" size={16} />
          ) : (
            <TriangleAlert aria-hidden="true" size={16} />
          )}
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
