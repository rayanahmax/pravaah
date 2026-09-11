/**
 * Route-level loading skeleton for the department console. Shown by Next while a
 * server page resolves its data, so navigation reads as instant and the layout
 * never collapses to a blank screen.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton--title" />
      <div className="metric-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton skeleton--card" />)}
      </div>
      <div className="skeleton skeleton--panel" />
      <div className="skeleton skeleton--panel" />
      <span className="visually-hidden">Loading destination data…</span>
    </div>
  );
}
