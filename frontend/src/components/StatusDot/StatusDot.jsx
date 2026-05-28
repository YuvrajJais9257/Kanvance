/**
 * StatusDot
 *
 * Renders a colored circle indicating a user's availability status.
 *
 * Props:
 *   status     — one of the six Status_Values (default: "Offline")
 *   showLabel  — render the status string next to the dot (default: false)
 *   size       — "sm" (8 px) | "md" (12 px) (default: "sm")
 */

export const STATUS_COLORS = {
  "Active":       "#22c55e",
  "Busy":         "#ef4444",
  "Away":         "#f59e0b",
  "Be Right Back":"#fb923c",
  "In a Meeting": "#a78bfa",
  "Offline":      "#6b7280",
};

const DOT_SIZE = { sm: 8, md: 12 };

export default function StatusDot({ status = "Offline", showLabel = false, size = "sm" }) {
  const color    = STATUS_COLORS[status] ?? STATUS_COLORS["Offline"];
  const diameter = DOT_SIZE[size] ?? DOT_SIZE.sm;

  return (
    <span
      style={{
        display:    "inline-flex",
        alignItems: "center",
        gap:        "5px",
        flexShrink: 0,
      }}
      title={status}
    >
      <span
        aria-label={`Status: ${status}`}
        role="img"
        style={{
          display:         "inline-block",
          width:           `${diameter}px`,
          height:          `${diameter}px`,
          borderRadius:    "50%",
          backgroundColor: color,
          flexShrink:      0,
          boxShadow:       `0 0 0 2px ${color}33`,
        }}
      />
      {showLabel && (
        <span style={{ fontSize: "12px", color: "#94a3b8", whiteSpace: "nowrap" }}>
          {status}
        </span>
      )}
    </span>
  );
}
