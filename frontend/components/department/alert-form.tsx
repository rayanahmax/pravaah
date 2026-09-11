"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Megaphone, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { ALERT_SEVERITIES } from "@/lib/department-labels";
import type { AlertRow } from "@/types/rows";

/**
 * Raise a new alert (PRD §16).
 *
 * The form sends the fields an operator is allowed to choose and nothing else.
 * `created_by` is filled in by the server from the authenticated profile, and
 * `active` is not offered at all — a notice raised now is live now, and letting the
 * browser set the flag would give a caller a way to publish a row that starts
 * switched off (AGENTS rule 6).
 *
 * The window is optional in both directions: "until further notice" is the normal
 * case. A `datetime-local` input yields a zone-less string like `2026-09-11T18:00`,
 * which `Date.parse` would read against whichever machine parses it — so the value
 * is converted to a UTC instant here before it is sent, and the API refuses
 * anything without an explicit zone.
 */
export function AlertForm({ destinationId }: { destinationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<(typeof ALERT_SEVERITIES)[number]>("INFO");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "error"; message: string } | null
  >(null);

  /** A zone-less local wall time -> the UTC instant the operator meant. */
  function toIso(value: string): string | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFeedback(null);

    const result = await apiPost<AlertRow>(
      `/api/v1/department/destinations/${destinationId}/alerts`,
      {
        title: title.trim(),
        message: message.trim(),
        severity,
        starts_at: toIso(startsAt),
        ends_at: toIso(endsAt),
      }
    );

    setPending(false);

    if (!result.ok) {
      setFeedback({ kind: "error", message: `Alert not raised: ${result.message}` });
      return;
    }

    setFeedback({ kind: "ok", message: `Alert raised: ${result.data.title}.` });
    setTitle("");
    setMessage("");
    setSeverity("INFO");
    setStartsAt("");
    setEndsAt("");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="action-btn" onClick={() => setOpen(true)}>
        <Megaphone aria-hidden="true" size={14} /> New alert
      </button>
    );
  }

  return (
    <form className="alert-form" onSubmit={submit}>
      <div className="alert-form__row">
        <label className="field">
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Trail closed beyond the second ridge"
          />
        </label>
        <label className="field">
          <span>Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof ALERT_SEVERITIES)[number])}
          >
            {ALERT_SEVERITIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          required
          rows={3}
          placeholder="What visitors need to know, in plain language."
        />
      </label>

      <div className="alert-form__row">
        <label className="field">
          <span>Starts (optional)</span>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Ends (optional)</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
      </div>

      <p className="alert-form__hint">
        Leave both bounds empty to raise a notice that runs until it is deactivated. A
        notice that ends before it starts is refused.
      </p>

      <div className="alert-form__actions">
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" size={16} className="spin" />
          ) : (
            <Megaphone aria-hidden="true" size={16} />
          )}
          {pending ? "Raising…" : "Raise alert"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setOpen(false);
            setFeedback(null);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>

      {feedback ? (
        <p
          className={`form-feedback form-feedback--${feedback.kind}`}
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
    </form>
  );
}
