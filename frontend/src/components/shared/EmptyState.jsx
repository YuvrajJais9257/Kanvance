import styles from "./EmptyState.module.css";

export default function EmptyState({
  icon = "📭",
  title,
  message,
  children,
  compact = false,
  className = "",
}) {
  const text = message ?? children;
  return (
    <div
      className={`${styles.wrap} ${compact ? styles.compact : ""} ${className}`}
      role="status"
    >
      <span className={styles.icon} aria-hidden>{icon}</span>
      {title && <p className={styles.heading}>{title}</p>}
      {text && <p className={styles.message}>{text}</p>}
    </div>
  );
}
