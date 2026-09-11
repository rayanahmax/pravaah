/**
 * Optional AI explanation for a readiness result (PRD §14).
 *
 * This is an EXPLANATION layer only, never a decision layer. It is given the
 * already-computed deterministic result and asked to phrase it kindly; it cannot
 * change the level or score. It is entirely optional and env-gated:
 *
 *  - If no provider is configured (missing READINESS_AI_* env), it returns null
 *    and the deterministic result stands alone — the feature works with no AI at
 *    all (PRD §14: "If the AI provider fails, deterministic results must still
 *    work").
 *  - On any error (network, non-2xx, timeout, unexpected shape) it returns null
 *    rather than throwing, so a provider outage can never break the assessment.
 *
 * The system prompt hard-bans the things AI must never do: medical judgement,
 * permit approval, overriding capacity/access, predicting weather, or inventing
 * requirements (PRD §14, AGENTS rules 12-13). It uses plain fetch against an
 * OpenAI-compatible endpoint, so no new dependency is introduced.
 */

import type { ReadinessAnswers, ReadinessResult } from "./readiness";

const SYSTEM_PROMPT =
  "You explain a rule-based trekking readiness result in plain, encouraging language. " +
  "STRICT RULES: You are informational only. Do NOT make or imply any medical or fitness " +
  "diagnosis. Do NOT approve or reject any permit or say whether the visitor may enter. Do NOT " +
  "override capacity, quota or access rules. Do NOT predict weather or disasters. Do NOT invent " +
  "destination requirements. Base your answer ONLY on the JSON result provided and never " +
  "contradict its level. Keep it under about 120 words.";

const REQUEST_TIMEOUT_MS = 8000;

/** Returns a short explanation, or null when AI is disabled or anything fails. */
export async function explainReadiness(
  _answers: ReadinessAnswers,
  result: ReadinessResult
): Promise<string | null> {
  const baseUrl = process.env.READINESS_AI_BASE_URL?.trim();
  const apiKey = process.env.READINESS_AI_API_KEY?.trim();
  const model = process.env.READINESS_AI_MODEL?.trim();

  // Not configured → deterministic-only. This is the normal, supported path.
  if (!baseUrl || !apiKey || !model) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Deterministic readiness result:\n" +
              JSON.stringify({
                level: result.level,
                score: result.score,
                strengths: result.strengths,
                advisories: result.advisories,
              }) +
              "\n\nWrite a short, kind explanation of this result.",
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);
    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim().slice(0, 1200) : null;
  } catch {
    // Any failure degrades to "no explanation"; the deterministic result is complete.
    return null;
  }
}
