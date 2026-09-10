import { NextResponse } from "next/server";
import { getUser, getProfile } from "@/lib/auth";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated." } },
      { status: 401 }
    );
  }

  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json(
      { error: { code: "PROFILE_NOT_FOUND", message: "No profile found for this user." } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: profile });
}
