import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

/**
 * Root entry point: send each visitor to the right surface for their role.
 *
 * A signed-in department operator goes to the console. Everyone else — a signed-in
 * tourist or an anonymous visitor — lands on the public destination browser,
 * because destination information is public (PRD) and a tourist should be able to
 * browse before signing in. The permit actions themselves are gated to signed-in
 * users on their own pages, not here.
 */
export default async function Home() {
  const profile = await getProfile();

  if (profile?.role === "DEPARTMENT_OPERATOR") {
    redirect("/overview");
  }

  redirect("/destinations");
}
