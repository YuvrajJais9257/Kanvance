import styles from "./Pagination.module.css";

/**
 * @param {number} page - 1-based current page
 * @param {number} totalPages
 * @param {number} totalItems
 * @param {number} pageSize
 * @param {(n: number) => void} onPageChange
 */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  className = "",
  compact = false,
}) {
  if (!totalItems || totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  return (
    <nav
      className={`${styles.bar} ${compact ? styles.compact : ""} ${className}`}
      aria-label="Pagination"
    >
      <span className={styles.summary}>
        Showing {from}–{to} of {totalItems}
      </span>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.btn}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          ← Prev
        </button>
        <span className={styles.pageInfo}>
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          className={styles.btn}
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
