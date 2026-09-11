"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./qr.module.css";

type CopyState = "idle" | "copied" | "failed";

/**
 * Copy the checkpoint token as text.
 *
 * The QR is the intended hand-off, but a checkpoint that cannot use its camera —
 * a cracked lens, a browser without camera permission, a printer's copy of the
 * pass — still has a paste field, and until now the token existed only as pixels
 * in that QR. This shows the same value the QR encodes so it can be read or
 * copied instead.
 *
 * No new exposure: the page already renders the QR, so anyone who can see this
 * screen can already recover the token from it. Access is unchanged — the page is
 * owner-only and APPROVED-only (`requireAuth` plus a `user_id` check upstream),
 * and the token is a one-time reference that carries no visitor identity
 * (PRD §9, AGENTS.md rule 11).
 */
export function TokenCopy({ token }: { token: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copy = useCallback(async () => {
    setState(await writeToken(token) ? "copied" : "failed");
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setState("idle"), 2600);
  }, [token]);

  return (
    <div className={styles.token}>
      <div className={styles["token__head"]}>
        <span className={styles["token__label"]}>Checkpoint token</span>
        <button
          type="button"
          className={styles["token__copy"]}
          onClick={() => void copy()}
        >
          {state === "copied" ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
          {state === "copied" ? "Copied" : "Copy"}
        </button>
      </div>

      <code className={styles["token__value"]}>{token}</code>

      <p className={styles["token__status"]} role="status" aria-live="polite">
        {state === "copied"
          ? "Copied. Staff paste this into the checkpoint scanner."
          : state === "failed"
            ? "Your browser blocked the copy. Select the code above and copy it manually."
            : "Give this to staff only if the QR cannot be scanned."}
      </p>
    </div>
  );
}

/**
 * Copy with the async clipboard API, falling back to a temporary selection.
 *
 * The async API is only exposed in a secure context, so a phone opened over a LAN
 * address (`http://192.168.x.x:3000`) — the realistic way this page is used in the
 * field — has no `navigator.clipboard` at all. `execCommand("copy")` still works
 * there. Both paths are attempted before admitting defeat so the failure message
 * is the last resort rather than the common case.
 */
async function writeToken(token: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(token);
      return true;
    } catch {
      /* fall through to the selection path */
    }
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = token;
    scratch.readOnly = true;
    scratch.setAttribute("aria-hidden", "true");
    scratch.style.position = "fixed";
    scratch.style.top = "-1000px";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    scratch.setSelectionRange(0, token.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(scratch);
    return copied;
  } catch {
    return false;
  }
}
