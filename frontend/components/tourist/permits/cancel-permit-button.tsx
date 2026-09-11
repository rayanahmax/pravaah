"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, TriangleAlert, XCircle } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import type { PermitDto } from "@/types/tourist";
import styles from "./permits.module.css";

/**
 * Owner-only cancellation. It posts to /api/v1/permits/{id}/cancel with no body;
 * the cancel_permit database function enforces ownership and eligibility, and RLS
 * guards it again underneath. A refusal (wrong state, not yours) is surfaced
 * verbatim. A two-step confirm prevents an accidental tap.
 */
export function CancelPermitButton({ permitId }: { permitId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (pending) return;
    setPending(true);
    setError(null);

    const result = await apiPost<PermitDto>(`/api/v1/permits/${permitId}/cancel`);
    setPending(false);
    setArmed(false);

    if (result.ok) {
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {armed ? (
        <div className={styles.actions}>
          <button type="button" className={`${styles.ghostBtn} ${styles.dangerBtn}`} disabled={pending} onClick={cancel}>
            {pending ? <Loader2 aria-hidden="true" size={16} className="spin" /> : <XCircle aria-hidden="true" size={16} />}
            Confirm cancel
          </button>
          <button type="button" className={styles.ghostBtn} disabled={pending} onClick={() => setArmed(false)}>
            Keep permit
          </button>
        </div>
      ) : (
        <button type="button" className={`${styles.ghostBtn} ${styles.dangerBtn}`} onClick={() => setArmed(true)}>
          <XCircle aria-hidden="true" size={16} /> Cancel permit
        </button>
      )}
      {error ? (
        <p className={styles["feedback feedback--error"]} role="alert">
          <TriangleAlert aria-hidden="true" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
