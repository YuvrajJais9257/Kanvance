import styles from "./PageShell.module.css";

/** Flex column layout: fixed header chrome + scrollable/virtual body */
export default function PageShell({ className = "", chrome, children }) {
  return (
    <div className={`${styles.shell} app-page ${className}`}>
      {chrome && <div className={styles.chrome}>{chrome}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
