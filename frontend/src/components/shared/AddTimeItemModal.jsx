/**
 * AddTimeItemModal.jsx
 * Modal for adding a single timesheet entry.
 *
 * Props:
 *   isOpen       — boolean, whether modal is visible
 *   subtasks     — array of { id, name } available subtasks
 *   onSave       — async fn(data) called with { subtask_id, date, hours_logged, time_type, remarks }
 *   onClose      — fn() called to close modal
 */

import { useState } from "react";
import styles from "./AddTimeItemModal.module.css";

const TIME_TYPES = [
  "Billable",
  "Non-billable",
  "Overtime",
  "Holidays",
  "Sick Time",
  "Training",
  "Vacation",
];

export default function AddTimeItemModal({ isOpen, subtasks = [], onSave, onClose }) {
  const [form, setForm] = useState({
    subtask_id: "",
    date: new Date().toISOString().split("T")[0],
    hours_logged: "",
    time_type: "Billable",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError("");
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate required fields
    if (!form.subtask_id) {
      setError("Subtask is required");
      return;
    }
    if (!form.date) {
      setError("Date is required");
      return;
    }
    if (!form.hours_logged || form.hours_logged <= 0 || form.hours_logged > 24) {
      setError("Hours must be between 0.01 and 24");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        subtask_id: Number(form.subtask_id),
        date: form.date,
        hours_logged: Number(form.hours_logged),
        time_type: form.time_type,
        remarks: form.remarks || null,
      });
      // Reset form on success
      setForm({
        subtask_id: "",
        date: new Date().toISOString().split("T")[0],
        hours_logged: "",
        time_type: "Billable",
        remarks: "",
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save time entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Add Time Entry</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="subtask_id">Subtask *</label>
            <select
              id="subtask_id"
              name="subtask_id"
              value={form.subtask_id}
              onChange={handleChange}
              required
            >
              <option value="">— Select subtask —</option>
              {subtasks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="date">Date *</label>
            <input
              id="date"
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="hours_logged">Hours Logged * (0.01 - 24)</label>
            <input
              id="hours_logged"
              type="number"
              name="hours_logged"
              step="0.25"
              min="0.01"
              max="24"
              value={form.hours_logged}
              onChange={handleChange}
              placeholder="e.g. 2.5"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="time_type">Time Type *</label>
            <select
              id="time_type"
              name="time_type"
              value={form.time_type}
              onChange={handleChange}
              required
            >
              {TIME_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="remarks">Remarks</label>
            <textarea
              id="remarks"
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              placeholder="Optional notes…"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
