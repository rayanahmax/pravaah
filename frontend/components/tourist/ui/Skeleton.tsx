import styles from "./ui.module.css";

/** A shimmer placeholder for loading regions. Decorative; hidden from AT. */
export function Skeleton({ variant = "line" }: { variant?: "line" | "card" }) {
  const sizing = variant === "card" ? styles["skeleton--card"] : styles["skeleton--line"];
  return <div className={`${styles.skeleton} ${sizing}`} aria-hidden="true" />;
}
