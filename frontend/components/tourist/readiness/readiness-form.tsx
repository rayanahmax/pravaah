"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { StatusPill, type PillTone } from "@/components/tourist/ui";
import {
  ACTIVITY_LEVELS,
  ALTITUDE_LEVELS,
  TREKKING_LEVELS,
  type ActivityLevel,
  type HighAltitudeExperience,
  type ReadinessAnswers,
  type ReadinessLevel,
  type TrekkingExperience,
} from "@/lib/readiness";
import styles from "./readiness.module.css";

type AssessResult = {
  level: ReadinessLevel;
  score: number;
  strengths: string[];
  advisories: string[];
  disclaimer: string;
  explanation: string | null;
  aiGenerated: boolean;
};

const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  READY: "You look well prepared",
  PROCEED_WITH_CAUTION: "Proceed with some preparation",
  PREPARE_MORE: "More preparation advised",
};

function levelTone(level: ReadinessLevel): PillTone {
  if (level === "READY") return "green";
  if (level === "PROCEED_WITH_CAUTION") return "pending";
  return "restricted";
}

/**
 * The readiness questionnaire. It posts answers to /api/v1/readiness/assess and
 * shows the deterministic result the server computed. The AI explanation, when
 * present, is clearly labelled as an informational, non-authoritative add-on.
 * Nothing here gates a permit — it is guidance only (PRD §13-14).
 */
export function ReadinessForm({
  destinationId,
  destinationName,
}: {
  destinationId: string;
  destinationName: string;
}) {
  const [trekkingExperience, setTrekking] = useState<TrekkingExperience>("beginner");
  const [highAltitudeExperience, setAltitude] = useState<HighAltitudeExperience>("none");
  const [activityLevel, setActivity] = useState<ActivityLevel>("moderate");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const answers: ReadinessAnswers = { trekkingExperience, highAltitudeExperience, activityLevel };
    const outcome = await apiPost<AssessResult>("/api/v1/readiness/assess", {
      destination_id: destinationId,
      answers,
    });
    setPending(false);

    if (outcome.ok) {
      setResult(outcome.data);
    } else {
      setError(outcome.message);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        A quick, informational check for <strong>{destinationName}</strong>. Answer honestly — this
        is general guidance, not a medical assessment, and it does not decide your permit.
      </p>

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          <span>Trekking experience</span>
          <select value={trekkingExperience} onChange={(e) => setTrekking(e.target.value as TrekkingExperience)} disabled={pending}>
            {TREKKING_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>High-altitude experience</span>
          <select value={highAltitudeExperience} onChange={(e) => setAltitude(e.target.value as HighAltitudeExperience)} disabled={pending}>
            {ALTITUDE_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Typical activity level</span>
          <select value={activityLevel} onChange={(e) => setActivity(e.target.value as ActivityLevel)} disabled={pending}>
            {ACTIVITY_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>

        {error ? (
          <p className={`${styles.feedback} ${styles["feedback--error"]}`} role="alert">
            <TriangleAlert aria-hidden="true" size={16} />
            {error}
          </p>
        ) : null}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" size={18} className="spin" /> : null}
          {pending ? "Assessing…" : "Check my readiness"}
        </button>
      </form>

      {result ? (
        <section className={styles.result} aria-live="polite">
          <div className={styles["result__head"]}>
            <h2 className={styles["result__level"]}>{LEVEL_LABEL[result.level]}</h2>
            <StatusPill tone={levelTone(result.level)} dot>{result.level.replaceAll("_", " ")}</StatusPill>
          </div>
          <div>
            <div className={styles["result__bar"]} role="img" aria-label={`Readiness score ${result.score} out of 100`}>
              <span style={{ width: `${Math.max(4, result.score)}%` }} />
            </div>
            <p className={styles.result__score}>Readiness score {result.score} / 100</p>
          </div>

          {result.strengths.length > 0 ? (
            <div className={styles["result__section"]}>
              <h3>Strengths</h3>
              <ul className={styles.result__list}>
                {result.strengths.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          {result.advisories.length > 0 ? (
            <div className={styles["result__section"]}>
              <h3>To consider</h3>
              <ul className={`${styles.result__list} ${styles["result__list--advice"]}`}>
                {result.advisories.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          ) : null}

          {result.explanation ? (
            <div className={styles.ai}>
              <span className={styles.ai__tag}><Sparkles aria-hidden="true" size={13} /> AI explanation · informational only</span>
              <p>{result.explanation}</p>
            </div>
          ) : null}

          <p className={styles.disclaimer}>{result.disclaimer}</p>
        </section>
      ) : null}
    </div>
  );
}
