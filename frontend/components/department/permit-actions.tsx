"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { isDecisionPending } from "@/lib/department-labels";
import type { PermitStatus } from "@/lib/permit-rules";
import type { PermitSummary } from "@/services/permits";

type Decision = "approve" | "reject" | "restrict";

const ENDPOINT: Record<Decision, string> = {
  approve: "approve",
  reject: "reject",
  restrict: "restrict",
};

const LABEL: Record<Decision, string> = {
  approve: "Approve",
  reject: "Reject",
  restrict: "Restrict",
};

/**
 * The three operator decisions for a single pending permit.
 *
 * The buttons only exist for a permit in a decidable state; the endpoints
 * re-enforce capacity and quota transactionally, so clicking is a request to run
 * those rules, never a promise of a particular outcome. A refusal (for example
 * that the reservation no longer fits) is surfaced inline rather than swallowed.
 */
export function PermitActions({
  permitId,
  status,
}: {
  permitId: string;
  status: PermitStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isDecisionPending(status)) return null;

  async function decide(decision: Decision) {
    if (pending) return;
    setPending(decision);
    setError(null);

    const outcome = await apiPost<PermitSummary>(
      `/api/v1/department/permits/${permitId}/${ENDPOINT[decision]}`
    );
    setPending(null);

    if (outcome.ok) {
      router.refresh();
    } else {
      setError(`${LABEL[decision]} failed: ${outcome.message}`);
    }
  }

  const actions: { decision: Decision; className: string; icon: typeof Check }[] = [
    { decision: "approve", className: "action-btn action-btn--approve", icon: Check },
    { decision: "restrict", className: "action-btn action-btn--restrict", icon: ShieldAlert },
    { decision: "reject", className: "action-btn action-btn--reject", icon: X },
  ];

  return (
    <div className="permit-actions">
      <div className="permit-actions__buttons">
        {actions.map(({ decision, className, icon: Icon }) => (
          <button
            key={decision}
            type="button"
            className={className}
            disabled={pending !== null}
            onClick={() => decide(decision)}
          >
            {pending === decision ? (
              <Loader2 aria-hidden="true" size={15} className="spin" />
            ) : (
              <Icon aria-hidden="true" size={15} />
            )}
            {LABEL[decision]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="form-feedback form-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
