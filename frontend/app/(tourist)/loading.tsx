import { Skeleton } from "@/components/tourist/ui";
import styles from "@/components/tourist/ui/ui.module.css";

/**
 * Route-level loading boundary for the whole tourist surface.
 *
 * Every tourist page is a Server Component that awaits Supabase reads (the
 * destination browser alone fans out to a capacity query per destination), so
 * without this file a navigation showed a blank screen until the entire render
 * resolved — which is what made clicking around feel slow. Next renders this
 * Suspense fallback the instant a link is followed, then swaps in the real page as
 * it streams, so the tap always has immediate feedback.
 *
 * It is a single boundary at the (tourist) segment, so it covers every page in the
 * group — visitor, destinations, permits, readiness and their nested routes —
 * without each needing its own file.
 */
export default function TouristLoading() {
  return (
    <div className={styles.loading} role="status" aria-label="Loading">
      <div className={`${styles.skeleton} ${styles["loading__title"]}`} aria-hidden="true" />
      <div className={styles.loading__grid}>
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    </div>
  );
}
