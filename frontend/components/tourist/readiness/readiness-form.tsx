"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { StatusPill, type PillTone } from "@/components/tourist/ui";
import {
  AGE_ANSWERS,
  EXPERIENCE_LEVELS,
  YES_NO,
  type AgeAnswer,
  type ExperienceLevel,
  type ReadinessAnswers,
  type ReadinessLevel,
  type YesNo,
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

const YES_NO_LABEL: Record<YesNo, string> = { yes: "Yes", no: "No" };
const AGE_LABEL: Record<AgeAnswer, string> = {
  yes: "Yes",
  no: "No",
  not_applicable: "Not applicable",
};

const YES_NO_QUESTIONS: Array<{ key: keyof ReadinessAnswers; label: string }> = [
  { key: "physicalPreparation", label: "Physical preparation — Are you comfortable walking/trekking for several hours?" },
  { key: "durationReady", label: "Duration — Can you comfortably manage the expected duration of the trek?" },
  { key: "elevationExperience", label: "Elevation — Have you previously travelled to a similar elevation?" },
  { key: "equipment", label: "Equipment — Do you have the required footwear, clothing, water, etc.?" },
  { key: "weatherPreparation", label: "Weather preparation — Have you trekked in similar expected weather conditions?" },
  { key: "routeKnowledge", label: "Route knowledge — Have you reviewed the route difficulty and requirements?" },
];

const DEFAULTS: ReadinessAnswers = {
  previousExperience: "none",
  physicalPreparation: "yes",
  durationReady: "yes",
  elevationExperience: "yes",
  equipment: "yes",
  weatherPreparation: "yes",
  routeKnowledge: "yes",
  ageRequirement: "not_applicable",
};

function levelTone(level: ReadinessLevel): PillTone {
  if (level === "READY") return "green";
  if (level === "PROCEED_WITH_CAUTION") return "pending";
  return "restricted";
}

/**
 * The readiness questionnaire (eight self-assessment questions). It posts answers
 * to /api/v1/readiness/assess and shows the deterministic result the server
 * computed. The AI explanation, when present, is clearly labelled informational
 * and non-authoritative. Nothing here gates a permit — it is guidance only
 * (PRD §13-14).
 */
export function ReadinessForm({
  destinationId,
  destinationName,
}: {
  destinationId: string;
  destinationName: string;
}) {
  const [answers, setAnswers] = useState<ReadinessAnswers>(DEFAULTS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);

  function set<K extends keyof ReadinessAnswers>(key: K, value: ReadinessAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

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
          <span>Previous experience — Have you visited a high-altitude / trekking destination before?</span>
          <select
            value={answers.previousExperience}
            onChange={(e) => set("previousExperience", e.target.value as ExperienceLevel)}
            disabled={pending}
          >
            {EXPERIENCE_LEVELS.map((v) => (
              <option key={v} value={v}>{v === "none" ? "No experience" : v === "some" ? "Some" : "Experienced"}</option>
            ))}
          </select>
        </label>

        {YES_NO_QUESTIONS.map(({ key, label }) => (
          <label key={key} className={styles.field}>
            <span>{label}</span>
            <select
              value={answers[key] as YesNo}
              onChange={(e) => set(key, e.target.value as YesNo)}
              disabled={pending}
            >
              {YES_NO.map((v) => (
                <option key={v} value={v}>{YES_NO_LABEL[v]}</option>
              ))}
            </select>
          </label>
        ))}

        <label className={styles.field}>
          <span>Age requirement — Does the visitor meet the destination&apos;s minimum age requirement, if applicable?</span>
          <select
            value={answers.ageRequirement}
            onChange={(e) => set("ageRequirement", e.target.value as AgeAnswer)}
            disabled={pending}
          >
            {AGE_ANSWERS.map((v) => (
              <option key={v} value={v}>{AGE_LABEL[v]}</option>
            ))}
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
