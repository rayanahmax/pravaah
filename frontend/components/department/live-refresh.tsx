"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live region for the department console (Phase 12).
 *
 * Subscribes to Supabase Realtime `postgres_changes` for the tables a page shows
 * and, on any change, asks Next to re-render the server components
 * (`router.refresh()`). That is the whole point: the event is treated purely as a
 * "something changed, re-read it" signal. The payload is never applied to state,
 * so the numbers on screen always come from the authoritative database through
 * the server layer — never from a client-supplied or event-supplied value
 * (AGENTS.md rules 6-7; docs/ARCHITECTURE.md §Realtime).
 *
 * Delivery is already gated by the same row level security SELECT policies as
 * ordinary reads, so this only ever learns about rows the operator could see
 * anyway. Events are coalesced with a short debounce so a burst of check-ins
 * triggers one refresh, not many.
 */

// Only `destinations` is keyed by its own id; every other watched table carries a
// destination_id column. The server filter narrows delivery to the active
// destination so one destination's activity does not refresh another's console.
function filterFor(table: string, destinationId?: string): string | undefined {
  if (!destinationId) return undefined;
  if (table === "destinations") return `id=eq.${destinationId}`;
  return `destination_id=eq.${destinationId}`;
}

export function LiveRefresh({
  tables,
  destinationId,
}: {
  tables: string[];
  destinationId?: string;
}) {
  const router = useRouter();
  const tablesKey = tables.join(",");

  useEffect(() => {
    const list = tablesKey ? tablesKey.split(",") : [];
    if (list.length === 0) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 250);
    };

    const channelName = `console:${destinationId ?? "all"}:${tablesKey}`;
    const channel = supabase.channel(channelName);

    for (const table of list) {
      const filter = filterFor(table, destinationId);
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        scheduleRefresh
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, destinationId, tablesKey]);

  return null;
}
