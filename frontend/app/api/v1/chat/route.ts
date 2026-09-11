import { getProfile } from "@/lib/auth";
import { listDestinations } from "@/services/destinations";
import { buildCapacityView } from "@/services/capacity";
import { listActiveAlerts } from "@/services/alerts";
import { listMyPermits } from "@/services/permits";
import { permitReference } from "@/lib/department-labels";
import { apiData, apiDatabaseError, apiError } from "@/lib/api/error";
import { readJsonBody } from "@/lib/api/validation";
import {
  detectIntent,
  parseChatRequest,
  renderGrounded,
  type GroundedDestination,
  type GroundedPermit,
  type GroundingContext,
} from "@/lib/chat";
import { phraseAssistantReply } from "@/lib/chat-ai";

/**
 * POST /api/v1/chat — the tourist assistant.
 *
 * The route is a facts-gathering orchestrator, not a decision-maker. It reads only
 * through the same RLS-scoped services the pages already use, so the assistant can
 * never be prompted into revealing more than the caller could see directly: public
 * destination state for anyone, and permit rows only for the signed-in owner. The
 * answer is always renderGrounded() first, then optionally re-phrased by
 * phraseAssistantReply(); an absent or failing provider returns the deterministic
 * text unchanged (PRD §14). No capacity, quota, access, permit, weather or medical
 * judgement is produced here — every such value is read from an existing service
 * that already computed it (AGENTS rules 6-7, 12-13).
 */

// Bounding the fan-out of live reads. A demo department has a handful of
// destinations; the cap keeps a site-wide "what's open?" query from scaling without
// limit, and the answer stays honest about the subset it summarised.
const MAX_DESTINATION_FACTS = 12;
const MAX_PERMIT_ROWS = 8;

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const parsed = parseChatRequest(body);
  if (!parsed.ok) return apiError("VALIDATION_ERROR", parsed.error);

  try {
    // Optional identity: anonymous visitors get public facts; a signed-in visitor
    // can additionally ask about their own permits. Never taken from the body.
    const profile = await getProfile();
    const intent = detectIntent(parsed.message);

    // Gather only what this intent reads, so "how do permits work" does not fan
    // out a capacity + alert query per destination for nothing.
    const [destinations, permits] = await Promise.all([
      intent === "capacity" || intent === "alerts"
        ? buildDestinationFacts()
        : Promise.resolve<GroundedDestination[]>([]),
      intent === "status" && profile
        ? buildPermitFacts(profile.id)
        : Promise.resolve<GroundedPermit[]>([]),
    ]);

    const context: GroundingContext = {
      destinations,
      permits,
      signedIn: Boolean(profile),
    };

    const deterministic = renderGrounded(parsed.message, context);
    const phrased = await phraseAssistantReply(
      parsed.message,
      parsed.history,
      context,
      deterministic
    );

    return apiData({
      reply: phrased ?? deterministic,
      // The factual text is returned alongside so the UI can, if it chooses, show
      // that an AI flourish was stripped away — but only the reply is rendered.
      usedAi: phrased !== null,
      suggestions: suggestionsFor(intent),
    });
  } catch (error) {
    return apiDatabaseError("POST /chat", error);
  }
}

async function buildDestinationFacts(): Promise<GroundedDestination[]> {
  const rows = (await listDestinations()).slice(0, MAX_DESTINATION_FACTS);
  return Promise.all(
    rows.map(async (row) => {
      // One destination's capacity or alert read failing must not blank the whole
      // list: fall back to the safe "no data" state, which renders as Closed/none
      // rather than as an invented "open".
      const [capacity, alerts] = await Promise.all([
        buildCapacityView(row).catch(() => null),
        listActiveAlerts(row.id).catch(() => []),
      ]);
      return {
        name: row.name,
        status: capacity?.status ?? "CLOSED",
        remaining: capacity?.remaining ?? null,
        occupancy: capacity?.occupancy ?? null,
        capacity: capacity?.capacity ?? null,
        accessStatus: row.access_status,
        alerts: alerts.map((alert) => ({ title: alert.title, severity: alert.severity })),
      };
    })
  );
}

async function buildPermitFacts(userId: string): Promise<GroundedPermit[]> {
  const [permits, destinations] = await Promise.all([
    listMyPermits(userId),
    listDestinations().catch(() => []),
  ]);
  const nameById = new Map(destinations.map((d) => [d.id, d.name]));
  return permits.slice(0, MAX_PERMIT_ROWS).map((permit) => ({
    reference: permitReference(permit.id),
    destination: nameById.get(permit.destination_id) ?? "a destination",
    status: permit.status,
    visitDate: permit.visit_date,
  }));
}

/** Quick follow-ups, keyed off intent so the chips stay relevant to what was asked. */
function suggestionsFor(intent: ReturnType<typeof detectIntent>): string[] {
  switch (intent) {
    case "greeting":
    case "unknown":
      return ["What's open right now?", "How do permits work?", "Any active alerts?"];
    case "capacity":
      return ["Which places are near capacity?", "Any alerts?", "How do I get a permit?"];
    case "alerts":
      return ["Is anything closed?", "What's open right now?", "How do I get a permit?"];
    case "status":
      return ["How do permits work?", "What's open right now?"];
    case "howto":
      return ["What's open right now?", "Any active alerts?"];
    default:
      return ["What's open right now?", "How do permits work?"];
  }
}
