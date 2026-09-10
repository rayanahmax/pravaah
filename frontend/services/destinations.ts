import { createClient } from "@/lib/supabase/server";
import type { DestinationInput } from "@/lib/api/validation";
import type { DestinationRow } from "@/types/rows";

/**
 * Destination reads and writes.
 *
 * Every query runs through the request-scoped Supabase client, so it executes as
 * the signed-in user under row level security: public destination data is
 * readable by anyone, and writes are permitted only by the operator policies in
 * migration 003. Nothing here bypasses that.
 *
 * PostgREST returns NUMERIC columns as strings to avoid precision loss, so the
 * numeric fields are normalised on the way out.
 */

/** NUMERIC arrives as a string; keep null as null rather than turning it into 0. */
export function toNumber(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const DESTINATION_COLUMNS =
  "id, name, description, type, latitude, longitude, difficulty, elevation, estimated_duration_minutes, access_status, created_at, updated_at";

/** What PostgREST actually returns for a destination: NUMERIC columns may be strings. */
type RawDestination = Omit<DestinationRow, "latitude" | "longitude"> & {
  latitude: string | number | null;
  longitude: string | number | null;
};

function normalise(row: RawDestination): DestinationRow {
  return {
    ...row,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
  };
}

export async function listDestinations(): Promise<DestinationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .select(DESTINATION_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw new Error(`listDestinations: ${error.message}`);
  return (data as RawDestination[] | null)?.map(normalise) ?? [];
}

export async function findDestination(id: string): Promise<DestinationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .select(DESTINATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<RawDestination>();

  if (error) throw new Error(`findDestination: ${error.message}`);
  return data ? normalise(data) : null;
}

export async function insertDestination(input: DestinationInput): Promise<DestinationRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .insert({
      name: input.name,
      description: input.description ?? null,
      type: input.type ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      difficulty: input.difficulty ?? null,
      elevation: input.elevation ?? null,
      estimated_duration_minutes: input.estimated_duration_minutes ?? null,
      access_status: input.access_status ?? "OPEN",
    })
    .select(DESTINATION_COLUMNS)
    .single<RawDestination>();

  if (error) throw new Error(`insertDestination: ${error.message}`);
  return normalise(data);
}

/**
 * Partial update. Returns null when nothing matched, which the caller reports as
 * 404 — RLS can make a forbidden update look identical to a missing row, and
 * that ambiguity is deliberate: it reveals nothing about rows the caller cannot
 * see.
 */
export async function updateDestination(
  id: string,
  patch: DestinationInput
): Promise<DestinationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("destinations")
    .update(patch)
    .eq("id", id)
    .select(DESTINATION_COLUMNS)
    .maybeSingle<RawDestination>();

  if (error) throw new Error(`updateDestination: ${error.message}`);
  return data ? normalise(data) : null;
}
