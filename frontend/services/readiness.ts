import { createClient } from "@/lib/supabase/server";

/**
 * Readiness persistence (Phase 14).
 *
 * Stores the questionnaire answers and the deterministic result (plus any
 * optional AI explanation) as a readiness_assessments row for the signed-in
 * user. The write runs under row level security as the caller, so the
 * "Tourists can create assessments" policy (auth.uid() = user_id) is what allows
 * it — user_id is taken from the authenticated profile, never from the request.
 */
export async function insertReadinessAssessment(input: {
  userId: string;
  destinationId: string;
  visitDate: string | null;
  answers: unknown;
  result: unknown;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("readiness_assessments")
    .insert({
      user_id: input.userId,
      destination_id: input.destinationId,
      visit_date: input.visitDate,
      answers: input.answers,
      result: input.result,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(`insertReadinessAssessment: ${error.message}`);
  return data?.id ?? null;
}
