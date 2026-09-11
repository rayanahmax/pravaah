import type { ReactNode } from "react";
import type { BadgeTone } from "@/lib/department-labels";

/**
 * The status pill used across the console. Maps a semantic tone onto the
 * existing `.status-badge--*` styles in globals.css so there is one badge look
 * everywhere and pages never hand-assemble classes.
 */
export function Badge({
  tone = "default",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  const modifier = tone === "default" ? "" : ` status-badge--${tone}`;
  return <span className={`status-badge${modifier}`}>{children}</span>;
}
