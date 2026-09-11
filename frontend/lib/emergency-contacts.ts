/**
 * Emergency dial information for the tourist-facing SOS dock.
 *
 * This module is deliberately pure and free of any I/O. Two reasons:
 *
 *  1. It reads `permits.emergency_contact`, which is JSONB and therefore typed
 *     `unknown` on PermitRow. Every shape assumption belongs in one auditable place
 *     rather than spread through a client component, so a permit whose contact is
 *     null, an array, or missing the phone cannot take the button down.
 *  2. `npm test` only picks up `*.test.ts` files under lib/, so any rule worth
 *     trusting has to live here to be tested at all (services/ is untested).
 *
 * It creates no requirement of its own: the PRD never specifies an SOS feature
 * (docs/PRD.md §4 lists it out of scope for MVP), so this surface is intentionally
 * read-only over already-collected data plus the pan-India emergency number. It
 * never calls, sends, or files anything by itself — a human taps a `tel:` link.
 */

import type { PermitRow } from "@/types/rows";

/** India's single emergency number; answered by police, fire and ambulance. */
export const EMERGENCY_SERVICES_NUMBER = "112";

/** One dialable entry in the SOS panel. */
export type EmergencyContact = {
  name: string | null;
  relationship: string | null;
  /** Digits (and a leading `+`) only — safe to interpolate into a `tel:` href. */
  phone: string;
};

/**
 * Reduce a user-entered phone to characters that are legal in a `tel:` URI.
 *
 * Returns null for anything with no digits at all, so a garbage value cannot render
 * a dead link. Spaces, dots, dashes and parentheses are dropped because iOS and
 * Android dialers accept the compact form but not always the decorated one.
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const stripped = raw.replace(/[^\d+]/g, "");
  // A '+' is only meaningful as a country-code prefix; a stray one mid-number or at
  // the end would produce an invalid URI, so keep at most a single leading '+'.
  const hasPlus = stripped.startsWith("+");
  const digits = stripped.replace(/\+/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

/** A `tel:` href, or null when the value cannot be dialled. */
export function telHref(raw: unknown): string | null {
  const phone = normalizePhone(raw);
  return phone ? `tel:${phone}` : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Collect the distinct emergency contacts a visitor has saved on their own permits.
 *
 * A visitor may hold several permits, often naming the same person each time, so the
 * list is de-duplicated by normalised phone and capped: an emergency panel that needs
 * scrolling to find the number has failed at its one job. Input order is preserved,
 * which is newest-first from listMyPermits, so the contact from the most recent
 * request is the one that survives a cap.
 */
export function extractEmergencyContacts(
  permits: readonly Pick<PermitRow, "emergency_contact">[],
  limit = 3
): EmergencyContact[] {
  const byPhone = new Map<string, EmergencyContact>();

  for (const permit of permits) {
    const contact = permit?.emergency_contact;
    // Must be a plain object: null, arrays and JSON scalars are all storable here.
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) continue;

    const fields = contact as Record<string, unknown>;
    const phone = normalizePhone(fields.phone);
    if (!phone) continue; // Nothing to dial, so nothing useful to show.
    if (byPhone.has(phone)) continue;

    byPhone.set(phone, {
      name: textOrNull(fields.name),
      relationship: textOrNull(fields.relationship),
      phone,
    });
    if (byPhone.size >= limit) break;
  }

  return [...byPhone.values()];
}
