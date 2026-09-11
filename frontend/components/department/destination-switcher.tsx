"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

/**
 * Destination selector for the department console.
 *
 * Selecting a destination rewrites the `?destination=` parameter, which opts the
 * page into a fresh server render against that destination. The switcher carries
 * no data of its own: the active id and the visible list come from the server,
 * and this component only asks the router to navigate.
 */
export function DestinationSwitcher({
  destinations,
  activeId,
}: {
  destinations: { id: string; name: string }[];
  activeId: string | null;
}) {
  const router = useRouter();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    router.push(next ? `?destination=${encodeURIComponent(next)}` : "?", { scroll: false });
  }

  return (
    <label className="destination-switcher">
      <span className="destination-switcher__label">Destination</span>
      <select value={activeId ?? ""} onChange={onChange}>
        {destinations.length === 0 ? <option value="">No destinations</option> : null}
        {destinations.map((destination) => (
          <option key={destination.id} value={destination.id}>
            {destination.name}
          </option>
        ))}
      </select>
    </label>
  );
}
