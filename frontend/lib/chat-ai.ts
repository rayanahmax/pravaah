/**
 * Optional language layer for the tourist assistant.
 *
 * Identical contract to lib/readiness-ai.ts, and for the same reason: the
 * assistant's authoritative answer is already produced by renderGrounded(), so
 * this can only ever rephrase it, never add to it. It is env-gated and returns
 * null (falling back to the deterministic text) when a provider is not configured
 * or the call fails, so the chatbot works with no AI at all and survives an
 * outage (PRD §14, "deterministic results must still work").
 *
 * Configuration, in priority order:
 *   1. CHAT_AI_BASE_URL / CHAT_AI_API_KEY / CHAT_AI_MODEL, if all set.
 *   2. Otherwise the existing READINESS_AI_* trio, so a deployment that already
 *      configured an assistant endpoint does not have to set it up twice.
 * Neither set complete -> disabled. No key is ever read on the client.
 *
 * The system prompt (lib/chat.ts) hard-bans the things the PRD forbids AI from
 * doing — inventing rules, permit decisions, weather prediction, medical advice —
 * and the caller's own permits are the only personal data sent, and only when the
 * visitor is signed in. Plain fetch, no new dependency.
 */

import {
  CHAT_SYSTEM_PROMPT,
  groundingPayload,
  type ChatTurn,
  type GroundingContext,
} from "./chat.ts";

const REQUEST_TIMEOUT_MS = 8000;

type ProviderConfig = { baseUrl: string; apiKey: string; model: string };

function resolveProvider(): ProviderConfig | null {
  const chatBase = process.env.CHAT_AI_BASE_URL?.trim();
  const chatKey = process.env.CHAT_AI_API_KEY?.trim();
  const chatModel = process.env.CHAT_AI_MODEL?.trim();
  if (chatBase && chatKey && chatModel) {
    return { baseUrl: chatBase, apiKey: chatKey, model: chatModel };
  }

  const legacyBase = process.env.READINESS_AI_BASE_URL?.trim();
  const legacyKey = process.env.READINESS_AI_API_KEY?.trim();
  const legacyModel = process.env.READINESS_AI_MODEL?.trim();
  if (legacyBase && legacyKey && legacyModel) {
    return { baseUrl: legacyBase, apiKey: legacyKey, model: legacyModel };
  }

  return null;
}

/** Whether an assistant provider is configured. The UI uses this to label replies. */
export function isAssistantConfigured(): boolean {
  return resolveProvider() !== null;
}

/**
 * Rewrite the deterministic `fallback` in friendlier prose, grounded strictly in
 * `context`. Returns the model's text, or null to signal "use the fallback".
 */
export async function phraseAssistantReply(
  message: string,
  history: ChatTurn[],
  context: GroundingContext,
  fallback: string
): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
    ];
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({
      role: "user",
      content:
        `FACTS (JSON):\n${JSON.stringify(groundingPayload(context))}\n\n` +
        `A suggested factual answer you may phrase more warmly, but must not contradict ` +
        `or extend: ${fallback}\n\nVisitor question: ${message}`,
    });

    const response = await fetch(
      `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.4,
          max_tokens: 260,
          messages,
        }),
        signal: controller.signal,
        cache: "no-store",
      }
    );

    clearTimeout(timer);
    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;
    return text.trim().slice(0, 1500);
  } catch {
    // Network, abort, bad JSON, unexpected shape: degrade to the deterministic text.
    return null;
  }
}
