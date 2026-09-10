"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.signOut().then(() => {
      router.replace("/login");
    });
  }, [supabase, router]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <p>Signing out…</p>
    </div>
  );
}
