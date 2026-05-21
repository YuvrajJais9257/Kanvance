/**
 * DeleteConfirmModal.jsx
 * GitHub-style hard-delete confirmation modal.
 * Delete button stays disabled until the user types the exact name.
 *
 * Props:
 *   entityType  — "project" | "customer"
 *   entityName  — exact name the user must type
 *   description — what will be deleted (shown in warning body)
 *   onConfirm   — async fn called when confirmed; receives no args
 *   onClose     — fn called to close without action
 */
import { useState } from "react";
import styles from "./DeleteConfirmModal.module.css";

export default function DeleteConfirmModal({
  entityType,
  entityName,
  description,
  onConfirm,
  onClose,
}) {
  const [typed, setTyped]     = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState("");

  const matches = typed === entityName;

  const handleConfirm = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
      // onConfirm is responsible for closing + redirecting
    } catch (err) {
      setError(err.message || "Deletion failed. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.warningIcon} aria-hidden="true">⚠</div>
          <h2 id="delete-modal-title" className={styles.title}>
            This action cannot be undone
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cancel and close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.description}>{description}</p>

          <div className={styles.confirmSection}>
            <label className={styles.label} htmlFor="confirm-input">
              To confirm, type{" "}
              <strong className={styles.nameHighlight}>{entityName}</strong>{" "}
              below:
            </label>
            <input
              id="confirm-input"
              className={`${styles.input} ${typed && !matches ? styles.inputError : ""} ${matches ? styles.inputMatch : ""}`}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type "${entityName}" to confirm`}
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches) handleConfirm();
                if (e.key === "Escape") onClose();
              }}
            />
            {typed && !matches && (
              <span className={styles.mismatch}>
                Name doesn't match — check capitalisation
              </span>
            )}
          </div>

          {error && (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className={styles.deleteBtn}
            onClick={handleConfirm}
            disabled={!matches || deleting}
            aria-disabled={!matches || deleting}
          >
            {deleting
              ? "Deleting…"
              : `I understand, delete ${entityType} permanently`}
          </button>
        </div>
      </div>
    </div>
  );
}
