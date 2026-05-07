import { useEffect, useRef } from "react";
import StatusDot, { STATUS_COLORS } from "./StatusDot";

const ALL_STATUSES = Object.keys(STATUS_COLORS);

/**
 * StatusPicker
 *
 * A popover that lets the logged-in user pick their own availability status
 * and toggle the Auto-Update preference.
 *
 * Props:
 *   currentStatus      — string        currently selected status
 *   onSelect           — (status) => void
 *   autoUpdate         — boolean       current auto-update preference
 *   onToggleAutoUpdate — () => void
 *   onClose            — () => void
 */
export default function StatusPicker({
  currentStatus,
  onSelect,
  autoUpdate,
  onToggleAutoUpdate,
  onClose,
}) {
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Set your availability status"
      style={{
        position:        "absolute",
        bottom:          "calc(100% + 8px)",
        left:            0,
        zIndex:          300,
        background:      "#1a2030",
        border:          "1px solid rgba(255,255,255,0.1)",
        borderRadius:    "12px",
        boxShadow:       "0 16px 48px rgba(0,0,0,0.6)",
        minWidth:        "200px",
        overflow:        "hidden",
      }}
    >
      {/* Status options */}
      <ul
        role="listbox"
        aria-label="Availability status options"
        style={{ listStyle: "none", margin: 0, padding: "6px 0" }}
      >
        {ALL_STATUSES.map((s) => (
          <li
            key={s}
            role="option"
            aria-selected={s === currentStatus}
            onClick={() => { onSelect(s); onClose(); }}
            style={{
              display:         "flex",
              alignItems:      "center",
              gap:             "10px",
              padding:         "9px 16px",
              cursor:          "pointer",
              background:      s === currentStatus ? "rgba(79,131,255,0.12)" : "transparent",
              color:           s === currentStatus ? "#e2e8f0" : "#94a3b8",
              fontSize:        "13px",
              fontWeight:      s === currentStatus ? 600 : 400,
              transition:      "background 0.12s",
            }}
            onMouseEnter={(e) => {
              if (s !== currentStatus) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              if (s !== currentStatus) e.currentTarget.style.background = "transparent";
            }}
          >
            <StatusDot status={s} size="sm" />
            {s}
          </li>
        ))}
      </ul>

      {/* Auto-update toggle */}
      <div
        style={{
          borderTop:   "1px solid rgba(255,255,255,0.07)",
          padding:     "10px 16px",
          display:     "flex",
          alignItems:  "center",
          gap:         "10px",
        }}
      >
        <input
          id="autoUpdateToggle"
          type="checkbox"
          checked={autoUpdate}
          onChange={onToggleAutoUpdate}
          style={{ cursor: "pointer", accentColor: "#4f83ff" }}
        />
        <label
          htmlFor="autoUpdateToggle"
          style={{ fontSize: "12px", color: "#64748b", cursor: "pointer", userSelect: "none" }}
        >
          Auto-update (away after 10 min idle)
        </label>
      </div>
    </div>
  );
}
