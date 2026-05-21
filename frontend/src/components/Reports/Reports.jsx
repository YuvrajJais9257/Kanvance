/**
 * Reports.jsx — Timesheet Excel Pipeline
 * 4-step workflow: Download template → Upload → Preview & Enrich → Export / Save to DB
 *
 * Step 3 now shows a conflict preview before any DB write:
 *   - New entries (green)
 *   - Conflicting entries that will overwrite existing (amber, shows existing source)
 *   - Rejected rows (red, permission or missing employee)
 * User must click "Confirm & Save" to commit. Download Excel is always available.
 */
import { useState, useRef, useEffect } from "react";
import Sidebar from "../sidebar/Sidebar";
import styles from "./Reports.module.css";
import {
  downloadTimesheetTemplate,
  uploadTimesheetFile,
  enrichTimesheet,
  exportTimesheet,
  getTimesheetRuns,
  previewTimeLogs,
  commitTimeLogs,
} from "../../api";
import { useError } from "../../context/ErrorContext";

const STEPS = ["Download Template", "Upload & Parse", "Preview & Enrich", "Export"];

const STATUS_COLORS = {
  "Done":              "#22c55e",
  "Completed":         "#22c55e",
  "In Progress":       "#3b82f6",
  "In Testing":        "#14b8a6",
  "Awaiting Feedback": "#f59e0b",
  "Blocked":           "#ef4444",
  "Not Started":       "#6b7280",
};

export default function Reports() {
  const { showError } = useError();
  const fileRef = useRef(null);

  const [step,          setStep]          = useState(0);
  const [parsedRows,    setParsedRows]     = useState([]);
  const [enrichedRows,  setEnrichedRows]   = useState([]);
  const [uploading,     setUploading]      = useState(false);
  const [enriching,     setEnriching]      = useState(false);
  const [exporting,     setExporting]      = useState(false);
  const [uploadedFile,  setUploadedFile]   = useState(null);
  const [runs,          setRuns]           = useState([]);
  const [runsLoading,   setRunsLoading]    = useState(false);
  const [activeTab,     setActiveTab]      = useState("workflow"); // "workflow" | "history"

  // Conflict preview state
  const [previewing,    setPreviewing]     = useState(false);
  const [previewData,   setPreviewData]    = useState(null); // result of previewTimeLogs()
  const [committing,    setCommitting]     = useState(false);

  // Post-import summary modal
  const [importResult,  setImportResult]   = useState(null); // { inserted, updated, rejected, message }

  // Load upload history
  const loadRuns = async () => {
    setRunsLoading(true);
    try {
      const data = await getTimesheetRuns();
      setRuns(data);
    } catch (err) { showError(err.message); }
    finally { setRunsLoading(false); }
  };

  useEffect(() => {
    if (activeTab === "history") loadRuns();
  }, [activeTab]);

  // ── Step 1: Download template ──────────────────────────────────────────
  const handleDownload = () => {
    downloadTimesheetTemplate();
  };

  // ── Step 2: Upload & parse ─────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file.name);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadTimesheetFile(fd);
      setParsedRows(result.rows);
      setEnrichedRows([]);
      setPreviewData(null);
      setStep(2);
    } catch (err) {
      showError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Step 3: Enrich ─────────────────────────────────────────────────────
  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const result = await enrichTimesheet(parsedRows);
      setEnrichedRows(result.rows);
      setPreviewData(null); // reset preview when rows change
    } catch (err) {
      showError(err.message);
    } finally {
      setEnriching(false);
    }
  };

  // ── Step 3: Preview conflicts before saving to DB ─────────────────────
  const handlePreviewConflicts = async () => {
    setPreviewing(true);
    try {
      const result = await previewTimeLogs(enrichedRows);
      setPreviewData(result);
    } catch (err) {
      showError(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  // ── Step 3: Confirm & Save to DB ──────────────────────────────────────
  const handleConfirmSave = async () => {
    if (!previewData) return;
    setCommitting(true);
    try {
      const result = await commitTimeLogs(previewData);
      setImportResult(result);
      setPreviewData(null); // clear preview after commit
    } catch (err) {
      showError(err.message);
    } finally {
      setCommitting(false);
    }
  };

  // ── Step 4: Export Excel ───────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const filename = `timesheet_enriched_${new Date().toISOString().split("T")[0]}.xlsx`;
      await exportTimesheet(enrichedRows, filename);
    } catch (err) {
      showError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setParsedRows([]);
    setEnrichedRows([]);
    setUploadedFile(null);
    setPreviewData(null);
    setImportResult(null);
  };

  const rowsToShow = enrichedRows.length ? enrichedRows : parsedRows;

  // Build a set of row_nums that are conflicts / rejected for table highlighting
  const conflictRowNums = new Set(previewData?.conflict_rows?.map((r) => r.row_num) ?? []);
  const rejectedRowNums = new Set(previewData?.rejected_rows?.map((r) => r.row_num) ?? []);

  return (
    <div>
      <Sidebar />
      <div className={styles.page} style={{ marginLeft: "260px" }}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Reports</h1>
            <p className={styles.subtitle}>Timesheet Excel pipeline — download, fill, upload, enrich, export</p>
          </div>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${activeTab === "workflow" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("workflow")}
            >Workflow</button>
            <button
              className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("history")}
            >Upload History</button>
          </div>
        </div>

        {activeTab === "workflow" ? (
          <>
            {/* Step indicator */}
            <div className={styles.stepBar}>
              {STEPS.map((label, i) => (
                <div key={i} className={`${styles.stepItem} ${i <= step ? styles.stepActive : ""}`}>
                  <div className={styles.stepCircle}>{i + 1}</div>
                  <span className={styles.stepLabel}>{label}</span>
                  {i < STEPS.length - 1 && <div className={styles.stepLine} />}
                </div>
              ))}
            </div>

            {/* Step panels */}
            <div className={styles.panels}>

              {/* ── Step 1: Download ──────────────────────────────────── */}
              <div className={`${styles.panel} ${step === 0 ? styles.panelActive : ""}`}>
                <h2 className={styles.panelTitle}>1. Download Template</h2>
                <p className={styles.panelDesc}>
                  Download the Excel template, fill in your timesheet data, then come back to upload it.
                  The template includes an Instructions sheet explaining each column.
                </p>
                <div className={styles.templateCols}>
                  {["Date", "Employee Name", "Project Name", "Task", "Subtask", "Hours Spent", "Status", "Notes"].map((col) => (
                    <span key={col} className={styles.colPill}>{col}</span>
                  ))}
                </div>
                <div className={styles.panelActions}>
                  <button className={styles.primaryBtn} onClick={handleDownload}>
                    ⬇ Download Template (.xlsx)
                  </button>
                  <button className={styles.secondaryBtn} onClick={() => setStep(1)}>
                    I already have a filled template →
                  </button>
                </div>
              </div>

              {/* ── Step 2: Upload ────────────────────────────────────── */}
              <div className={`${styles.panel} ${step === 1 ? styles.panelActive : ""}`}>
                <h2 className={styles.panelTitle}>2. Upload Filled Template</h2>
                <p className={styles.panelDesc}>
                  Upload your completed .xlsx file. The system will parse and validate each row.
                </p>
                <div
                  className={styles.dropZone}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileChange({ target: { files: [file] } });
                  }}
                >
                  {uploading ? (
                    <span className={styles.dropZoneText}>Parsing…</span>
                  ) : (
                    <>
                      <span className={styles.dropZoneIcon}>📂</span>
                      <span className={styles.dropZoneText}>
                        Click or drag &amp; drop your .xlsx file here
                      </span>
                      {uploadedFile && (
                        <span className={styles.dropZoneFile}>{uploadedFile}</span>
                      )}
                    </>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div className={styles.panelActions}>
                  <button className={styles.ghostBtn} onClick={() => setStep(0)}>← Back</button>
                </div>
              </div>

              {/* ── Step 3: Preview & Enrich ──────────────────────────── */}
              <div className={`${styles.panel} ${step === 2 ? styles.panelActive : ""}`}>
                <h2 className={styles.panelTitle}>3. Preview &amp; Enrich</h2>
                <p className={styles.panelDesc}>
                  {enrichedRows.length
                    ? `${enrichedRows.length} rows enriched — DB values filled in where your upload was blank. Your uploaded values take priority.`
                    : `${parsedRows.length} rows parsed. Click Enrich to cross-reference with the database.`}
                </p>

                {/* Conflict preview summary badges */}
                {previewData && (
                  <div className={styles.previewSummary}>
                    <div className={`${styles.previewBadge} ${styles.badgeTotal}`}>
                      <strong>{previewData.total}</strong> total rows
                    </div>
                    <div className={`${styles.previewBadge} ${styles.badgeNew}`}>
                      <strong>{previewData.new_count}</strong> new entries
                    </div>
                    <div className={`${styles.previewBadge} ${styles.badgeConflict}`}>
                      <strong>{previewData.conflict_count}</strong> will overwrite existing
                    </div>
                    <div className={`${styles.previewBadge} ${styles.badgeRejected}`}>
                      <strong>{previewData.rejected_count}</strong> rejected
                    </div>
                  </div>
                )}

                {previewData?.conflict_count > 0 && (
                  <div className={styles.conflictNote}>
                    ⚠ {previewData.conflict_count} row{previewData.conflict_count !== 1 ? "s" : ""} will overwrite existing entries (highlighted in amber below). Existing hours and source are shown.
                  </div>
                )}

                {previewData?.rejected_count > 0 && (
                  <div className={styles.rejectNote}>
                    ✕ {previewData.rejected_count} row{previewData.rejected_count !== 1 ? "s" : ""} rejected (highlighted in red). These will not be saved. See the "Reason" column for details.
                  </div>
                )}

                {rowsToShow.length > 0 && (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Date</th>
                          <th>Employee</th>
                          <th>Project</th>
                          <th>Task</th>
                          <th>Hours</th>
                          <th>Status</th>
                          <th>Matched</th>
                          {previewData && <th>DB Status</th>}
                          {previewData && <th>Reason</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsToShow.map((r, i) => {
                          const sc = STATUS_COLORS[r.status_final || r.status_uploaded] ?? "#6b7280";
                          const isConflict = previewData && conflictRowNums.has(r.row_num ?? i + 1);
                          const isRejected = previewData && rejectedRowNums.has(r.row_num ?? i + 1);

                          // Find conflict/rejected detail
                          const conflictDetail = isConflict
                            ? previewData.conflict_rows.find((cr) => cr.row_num === (r.row_num ?? i + 1))
                            : null;
                          const rejectedDetail = isRejected
                            ? previewData.rejected_rows.find((rr) => rr.row_num === (r.row_num ?? i + 1))
                            : null;

                          let rowClass = r.matched ? styles.rowMatched : "";
                          if (isConflict) rowClass = styles.rowConflict;
                          if (isRejected) rowClass = styles.rowRejected;

                          return (
                            <tr key={i} className={rowClass}>
                              <td className={styles.rowNum}>{r.row_num ?? i + 1}</td>
                              <td>{r.logged_date ?? "—"}</td>
                              <td>{r.employee ?? "—"}</td>
                              <td>{r.project_name ?? "—"}</td>
                              <td>{r.task_name ?? "—"}</td>
                              <td className={styles.hours}>
                                {r.hours_final ?? r.hours_uploaded ?? "—"}
                              </td>
                              <td>
                                <span
                                  className={styles.statusBadge}
                                  style={{ background: sc + "22", color: sc, border: `1px solid ${sc}44` }}
                                >
                                  {r.status_final || r.status_uploaded || "—"}
                                </span>
                              </td>
                              <td>
                                {enrichedRows.length > 0 ? (
                                  <span className={r.matched ? styles.matchedYes : styles.matchedNo}>
                                    {r.matched ? "✓" : "—"}
                                  </span>
                                ) : "—"}
                              </td>
                              {previewData && (
                                <td>
                                  {isConflict ? (
                                    <span className={`${styles.conflictTag} ${styles.conflictTagOverwrite}`}>
                                      overwrites {conflictDetail?.existing_source ?? "?"} ({conflictDetail?.existing_hours ?? "?"}h)
                                    </span>
                                  ) : isRejected ? (
                                    <span className={`${styles.conflictTag} ${styles.conflictTagRejected}`}>rejected</span>
                                  ) : (
                                    <span className={`${styles.conflictTag} ${styles.conflictTagNew}`}>new</span>
                                  )}
                                </td>
                              )}
                              {previewData && (
                                <td style={{ color: "#ef4444", fontSize: "12px", maxWidth: "200px", whiteSpace: "normal" }}>
                                  {rejectedDetail?.reject_reason ?? ""}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className={styles.panelActions}>
                  <button className={styles.ghostBtn} onClick={() => setStep(1)}>← Re-upload</button>

                  {!enrichedRows.length ? (
                    <button
                      className={styles.primaryBtn}
                      onClick={handleEnrich}
                      disabled={enriching}
                    >
                      {enriching ? "Enriching…" : "Enrich from Database →"}
                    </button>
                  ) : (
                    <>
                      {/* Always available: proceed to Excel export */}
                      <button className={styles.secondaryBtn} onClick={() => setStep(3)}>
                        Proceed to Export →
                      </button>

                      {/* Preview conflicts before saving to DB */}
                      {!previewData && (
                        <button
                          className={styles.primaryBtn}
                          onClick={handlePreviewConflicts}
                          disabled={previewing}
                        >
                          {previewing ? "Checking…" : "Preview DB Save →"}
                        </button>
                      )}

                      {/* Confirm & Save — only shown after preview */}
                      {previewData && (
                        <button
                          className={styles.primaryBtn}
                          onClick={handleConfirmSave}
                          disabled={committing || previewData.valid === 0}
                          title={previewData.valid === 0 ? "No valid rows to save" : undefined}
                        >
                          {committing
                            ? "Saving…"
                            : `Confirm & Save ${previewData.valid} row${previewData.valid !== 1 ? "s" : ""} to DB`}
                        </button>
                      )}

                      {/* Re-run preview if user wants to refresh */}
                      {previewData && (
                        <button
                          className={styles.ghostBtn}
                          onClick={() => setPreviewData(null)}
                        >
                          ↺ Re-check
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── Step 4: Export ────────────────────────────────────── */}
              <div className={`${styles.panel} ${step === 3 ? styles.panelActive : ""}`}>
                <h2 className={styles.panelTitle}>4. Export Enriched Timesheet</h2>
                <p className={styles.panelDesc}>
                  Your enriched timesheet is ready. The exported file contains clean data with no
                  conflict markers — your uploaded values are the source of truth.
                  A Summary sheet with totals is included.
                </p>

                <div className={styles.exportStats}>
                  <div className={styles.statCard}>
                    <span className={styles.statNum}>{enrichedRows.length}</span>
                    <span className={styles.statLabel}>Total Rows</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statNum}>
                      {enrichedRows.filter((r) => r.matched).length}
                    </span>
                    <span className={styles.statLabel}>Matched to DB</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statNum}>
                      {Math.round(
                        enrichedRows.reduce((s, r) => s + (Number(r.hours_final) || 0), 0) * 10
                      ) / 10}
                    </span>
                    <span className={styles.statLabel}>Total Hours</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statNum}>
                      {new Set(enrichedRows.map((r) => r.employee).filter(Boolean)).size}
                    </span>
                    <span className={styles.statLabel}>Employees</span>
                  </div>
                </div>

                <div className={styles.panelActions}>
                  <button className={styles.ghostBtn} onClick={() => setStep(2)}>← Back to Preview</button>
                  <button
                    className={styles.primaryBtn}
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? "Generating…" : "⬇ Download Enriched Excel"}
                  </button>
                  <button
                    className={styles.secondaryBtn}
                    onClick={handleReset}
                  >
                    Start New Upload
                  </button>
                </div>
              </div>

            </div>
          </>
        ) : (
          /* ── Upload History tab ─────────────────────────────────────── */
          <div className={styles.historyWrap}>
            <div className={styles.historyHeader}>
              <h2 className={styles.panelTitle}>Upload History</h2>
              <button className={styles.secondaryBtn} onClick={loadRuns}>↻ Refresh</button>
            </div>
            {runsLoading ? (
              <div className={styles.loading}>Loading…</div>
            ) : runs.length === 0 ? (
              <div className={styles.empty}>No uploads yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Filename</th>
                      <th>Rows</th>
                      <th>Status</th>
                      <th>Uploaded By</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td className={styles.rowNum}>#{r.id}</td>
                        <td>{r.filename}</td>
                        <td>{r.row_count}</td>
                        <td>
                          <span className={`${styles.runStatus} ${styles[`runStatus_${r.status}`]}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>{r.uploaded_by_name ?? "—"}</td>
                        <td>{new Date(r.uploaded_at).toLocaleString("en-GB")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Post-import summary modal ──────────────────────────────────── */}
      {importResult && (
        <div className={styles.summaryOverlay} onClick={() => setImportResult(null)}>
          <div className={styles.summaryModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.summaryIcon}>✅</div>
            <h2 className={styles.summaryTitle}>Import Complete</h2>
            <p className={styles.summaryMsg}>{importResult.message}</p>
            <div className={styles.summaryStats}>
              <div className={styles.summaryStatCard}>
                <span className={`${styles.summaryStatNum} ${styles.numNew}`}>{importResult.inserted}</span>
                <span className={styles.summaryStatLabel}>New</span>
              </div>
              <div className={styles.summaryStatCard}>
                <span className={`${styles.summaryStatNum} ${styles.numOverwrite}`}>{importResult.updated}</span>
                <span className={styles.summaryStatLabel}>Overwritten</span>
              </div>
              <div className={styles.summaryStatCard}>
                <span className={`${styles.summaryStatNum} ${styles.numRejected}`}>{importResult.rejected}</span>
                <span className={styles.summaryStatLabel}>Rejected</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button className={styles.primaryBtn} onClick={() => setImportResult(null)}>
                Done
              </button>
              <button className={styles.ghostBtn} onClick={handleReset}>
                Start New Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
