import styles from "./PageSkeleton.module.css";

const S = ({ className }) => <div className={`skeleton ${className}`} aria-hidden />;

export default function PageSkeleton({ variant = "list", rows = 5, className = "" }) {
  if (variant === "compact") {
    return (
      <div className={`${styles.wrap} ${className}`} aria-busy="true" aria-label="Loading">
        <S className={styles.compact} />
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={`${styles.wrap} ${className}`} aria-busy="true" aria-label="Loading">
        <div className={styles.grid}>
          {Array.from({ length: rows }, (_, i) => (
            <S key={i} className={styles.gridItem} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={`${styles.wrap} ${className}`} aria-busy="true" aria-label="Loading">
        <div className={styles.table}>
          <S className={styles.tableHead} />
          {Array.from({ length: rows }, (_, i) => (
            <S key={i} className={styles.tableRow} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "analytics") {
    return (
      <div className={`${styles.wrap} ${className}`} aria-busy="true" aria-label="Loading">
        <div className={styles.kpiGrid}>
          {Array.from({ length: 8 }, (_, i) => (
            <S key={i} className={styles.kpiCard} />
          ))}
        </div>
        <S className={styles.block} />
        <S className={styles.block} />
      </div>
    );
  }

  return (
    <div className={`${styles.wrap} ${className}`} aria-busy="true" aria-label="Loading">
      <div className={styles.list}>
        {Array.from({ length: rows }, (_, i) => (
          <S key={i} className={styles.listItem} />
        ))}
      </div>
    </div>
  );
}
