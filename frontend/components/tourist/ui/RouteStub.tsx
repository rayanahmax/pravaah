import styles from "./ui.module.css";

/**
 * Placeholder rendered by the route stubs the foundation pre-creates, so every
 * Phase 13 route exists on `main` before the three owners branch. Because the
 * files already exist, no two people ever "create" the same page and collide.
 */
export function RouteStub({
  path,
  owner,
  purpose,
}: {
  path: string;
  owner: string;
  purpose: string;
}) {
  return (
    <div className={styles.stub}>
      <span className={styles["stub__owner"]}>Owned by {owner}</span>
      <p>
        <span className={styles["stub__path"]}>{path}</span> — {purpose}
      </p>
      <p>
        Phase 13 foundation placeholder. Replace the contents of this file with the
        real page; do not add new route files outside the ownership map.
      </p>
    </div>
  );
}
