import Sidebar from "../sidebar/Sidebar";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./Projects.module.css";
import {
  getProjects, getProject, createProject, updateProject, deleteProject,
  updateSubtask, createSubtask, deleteSubtask,
  createGroup, updateGroup, deleteGroup,
  getCustomers, getTeam,
  getEntityDocs, getPickerDocs, linkDocument, unlinkDocument, uploadDocument,
  getEntityInfra, getPickerInfra, linkInfra, unlinkInfra,
  hardDeleteProject,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";
import DeleteConfirmModal from "../shared/DeleteConfirmModal";
import PageSkeleton from "../shared/PageSkeleton";
import EmptyState from "../shared/EmptyState";
import VirtualList from "../shared/VirtualList";
import PageShell from "../shared/PageShell";

// ── Constants ────────────────────────────────────────────────
const typeTabs = ["All", "Implementation", "Managed Service", "License Renewal", "New Opportunity"];

const todayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric",
}).format(new Date());

// Roles that can assign subtasks to other users
const ASSIGNER_ROLES = ["ADMIN", "LEAD", "MANAGER"];

// Format a raw date string (ISO or YYYY-MM-DD) to "30 May 2026"
function formatDate(raw) {
  if (!raw) return "—";
  try {
    // Parse as local date to avoid timezone shifts
    const d = new Date(raw.includes("T") ? raw : raw + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return raw;
  }
}

// Phase 1 — 6 statuses with colours
const STATUSES = [
  { label: "Not Started",      color: "#6b7280" },
  { label: "In Progress",      color: "#3b82f6" },
  { label: "In Testing",       color: "#14b8a6" },
  { label: "Awaiting Feedback",color: "#f59e0b" },
  { label: "Blocked",          color: "#ef4444" },
  { label: "Done",             color: "#22c55e" },
];

const STATUS_COLOR = Object.fromEntries(STATUSES.map((s) => [s.label, s.color]));

// Flag types → which ones set "Awaiting Feedback" vs "Blocked"
const AWAITING_FEEDBACK_FLAGS = [
  "Waiting for approval",
  "Waiting for customer",
  "Waiting for third party",
];
const FLAG_TYPES = [
  ...AWAITING_FEEDBACK_FLAGS,
  "Technical blocker",
  "Resource unavailable",
  "Dependency blocked",
  "Other",
];

const getTypeClass = (type) => {
  if (type === "Implementation")  return styles.typeImplementation;
  if (type === "Managed Service") return styles.typeManaged;
  if (type === "License Renewal") return styles.typeRenewal;
  return styles.typeOpportunity;
};

// ── Status Badge (clickable dropdown — position:fixed to escape overflow:hidden) ──
function StatusBadge({ status, onSelect }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef(null);
  const color = STATUS_COLOR[status] ?? "#6b7280";

  const openDropdown = () => {
    if (badgeRef.current) {
      const r = badgeRef.current.getBoundingClientRect();
      // Open below the badge; if too close to bottom, open above
      const spaceBelow = window.innerHeight - r.bottom;
      const dropHeight = 240; // approx height of dropdown
      const top = spaceBelow > dropHeight ? r.bottom + 4 : r.top - dropHeight - 4;
      setDropPos({ top, left: r.left });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (badgeRef.current && !badgeRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      className={styles.statusBadgeWrap}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        ref={badgeRef}
        className={styles.statusBadge}
        style={{ background: color + "22", color, border: `1px solid ${color}55` }}
        onClick={openDropdown}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${status}. Click to change.`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDropdown(); }
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {status}
      </span>
      {open && (
        <div
          className={styles.statusDropdown}
          style={{ top: dropPos.top, left: dropPos.left }}
        >
          {STATUSES.map((s) => (
            <div
              key={s.label}
              className={styles.statusOption}
              style={{ color: s.color }}
              role="option"
              tabIndex={0}
              onClick={() => { onSelect(s.label); setOpen(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault(); onSelect(s.label); setOpen(false);
                }
              }}
            >
              <span className={styles.statusDot} style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Assignee Multi-Picker (position:fixed dropdown; toggles multiple users) ─
function AssigneeMultiPicker({ currentAssignees = [], inherited, team, onSave }) {
  const [open, setOpen]       = useState(false);
  const [selected, setSelected] = useState(() => new Set((currentAssignees || []).map((a) => a.user_id)));
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const chipRef  = useRef(null);
  const [tooltipId] = useState(() => `assignee-tip-${Math.random().toString(36).slice(2)}`);

  // Sync selection when parent data changes (e.g. after save)
  useEffect(() => {
    setSelected(new Set((currentAssignees || []).map((a) => a.user_id)));
  }, [currentAssignees]);

  const isMobile = () => window.innerWidth <= 640;

  const openDropdown = () => {
    // Reset selection to current state whenever the dropdown opens
    setSelected(new Set((currentAssignees || []).map((a) => a.user_id)));
    if (!isMobile() && chipRef.current) {
      const r = chipRef.current.getBoundingClientRect();
      const dropWidth = 240;
      const spaceBelow = window.innerHeight - r.bottom;
      const dropHeight = Math.min(team.length * 42 + 90, 340);
      const top  = spaceBelow > dropHeight ? r.bottom + 4 : r.top - dropHeight - 4;
      const left = Math.min(Math.max(4, r.right - dropWidth), window.innerWidth - dropWidth - 8);
      setDropPos({ top, left });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        // Check if click is inside the dropdown itself (fixed positioned)
        const drop = document.getElementById(`amp-drop-${tooltipId}`);
        if (drop && drop.contains(e.target)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, tooltipId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const toggle = (userId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSave = () => {
    onSave([...selected]);
    setOpen(false);
  };

  // Build display: up to 2 avatars stacked, then "+N" badge, or "+" when empty
  const assigneeList  = currentAssignees || [];
  const visibleCount  = Math.min(assigneeList.length, 2);
  const overflowCount = assigneeList.length - visibleCount;

  const ariaLabel = inherited
    ? "Inherited from project owner. Click to assign."
    : assigneeList.length > 0
    ? `Assigned to ${assigneeList.map((a) => a.user_name).join(", ")}. Click to change.`
    : "Unassigned. Click to assign.";

  return (
    <div className={styles.assigneeWrap} onClick={(e) => e.stopPropagation()}>
      {/* Trigger — stacked avatars or empty "+" chip */}
      <span
        ref={chipRef}
        className={`${styles.assigneeMultiTrigger} ${assigneeList.length === 0 ? styles.assigneeChipEmpty : ""} ${inherited ? styles.assigneeChipInherited : ""}`}
        aria-label={ariaLabel}
        aria-describedby={inherited ? tooltipId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openDropdown}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDropdown(); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
      >
        {assigneeList.length === 0 ? (
          <span className={styles.assigneeChip} style={{ background: "none" }}>+</span>
        ) : (
          assigneeList.slice(0, 2).map((a, idx) => (
            <span
              key={a.user_id}
              title={a.user_name}
              style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--gradient-avatar)",
                color: "var(--blue-text)",
                fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "2px solid var(--bg-surface)",
                marginLeft: idx === 0 ? 0 : -6,
                zIndex: 2 - idx,
                position: "relative",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {a.user_name?.[0]?.toUpperCase()}
            </span>
          ))
        )}
        {overflowCount > 0 && (
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            fontSize: 8, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--bg-surface)",
            marginLeft: -6, position: "relative", zIndex: 0,
            flexShrink: 0, cursor: "pointer",
          }}>
            +{overflowCount}
          </span>
        )}
      </span>

      {/* Mobile overlay */}
      {open && isMobile() && (
        <div className={styles.assigneeOverlay} onMouseDown={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Dropdown */}
      {open && (
        <div
          id={`amp-drop-${tooltipId}`}
          className={styles.assigneeDropdown}
          style={isMobile() ? {} : { top: dropPos.top, left: dropPos.left }}
          role="listbox"
          aria-label="Assign to"
          aria-multiselectable="true"
        >
          {inherited && (
            <div id={tooltipId} className={styles.assigneeInheritedNote} role="tooltip">
              Inherited from project owner. Select members to assign explicitly.
            </div>
          )}
          <div className={styles.ampList}>
            {team.map((m) => {
              const isOn = selected.has(m.id);
              return (
                <div
                  key={m.id}
                  className={`${styles.assigneeOption} ${isOn ? styles.assigneeOptionActive : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); toggle(m.id); }}
                  role="option"
                  aria-selected={isOn}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(m.id); }
                  }}
                >
                  <span className={styles.assigneeAvatar}>{m.name[0]}</span>
                  <span style={{ flex: 1 }}>{m.name}</span>
                  {isOn && <span className={styles.ampCheck} aria-hidden="true">✓</span>}
                </div>
              );
            })}
          </div>
          <div className={styles.ampFooter}>
            {selected.size > 0 && (
              <button
                className={styles.ampClearBtn}
                onMouseDown={(e) => { e.preventDefault(); setSelected(new Set()); }}
                type="button"
              >
                Clear
              </button>
            )}
            <button
              className={styles.ampSaveBtn}
              onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
              type="button"
            >
              {selected.size === 0 ? "Unassign" : `Assign (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flag Icon ────────────────────────────────────────────────
function FlagIcon({ flagged, title, onClick }) {  return (
    <span
      className={`${styles.flagIcon} ${flagged ? styles.flagIconActive : ""}`}
      title={title}
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
    >
      ⚑
    </span>
  );
}

// ── Flag Modal ───────────────────────────────────────────────
function FlagModal({ subtask, onSave, onClear, onClose }) {
  const [flagType,      setFlagType]      = useState(subtask.flag_type      ?? FLAG_TYPES[0]);
  const [flagReason,    setFlagReason]    = useState(subtask.flag_reason    ?? "");
  const [flagWaitingOn, setFlagWaitingOn] = useState(subtask.flag_waiting_on ?? "");
  const hasFlag = !!subtask.flag_type;

  const handleSave = () => {
    const newStatus = AWAITING_FEEDBACK_FLAGS.includes(flagType)
      ? "Awaiting Feedback"
      : "Blocked";
    onSave({ flag_type: flagType, flag_reason: flagReason, flag_waiting_on: flagWaitingOn, status: newStatus });
  };

  // B-5 fix: don't force status to "In Progress" — preserve whatever the subtask had before
  // Only clear the flag fields; let the user set status manually if needed.
  const handleClear = () => {
    onClear({ flag_type: null, flag_reason: null, flag_waiting_on: null });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Flag Subtask</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.form} style={{ padding: "20px" }}>
          <div className={styles.field}>
            <label>Flag Type</label>
            <select value={flagType} onChange={(e) => setFlagType(e.target.value)}>
              {FLAG_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Reason</label>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Describe the blocker…"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Waiting on</label>
            <input
              placeholder="e.g. John from infra team"
              value={flagWaitingOn}
              onChange={(e) => setFlagWaitingOn(e.target.value)}
            />
          </div>
          <div className={styles.modalActions}>
            {hasFlag && (
              <button type="button" className={styles.clearFlagBtn} onClick={handleClear}>
                Clear Flag
              </button>
            )}
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.saveBtn} onClick={handleSave}>Save Flag</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────
const Projects = () => {
  const { showError } = useError();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [projects, setProjects]         = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [team, setTeam]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterOwner, setFilterOwner]   = useState("All");
  const [expandedProjectId, setExpandedProjectId] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [collapsedTasks, setCollapsedTasks] = useState({});
  const [addingSubtask, setAddingSubtask]   = useState({});
  const [showModal, setShowModal]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [flagModal, setFlagModal]       = useState(null); // { subtask, projectId }

  // ── Edit project modal state ───────────────────────────────
  const [editModal, setEditModal]       = useState(null); // project object to edit
  const [editForm, setEditForm]         = useState({});
  const [editSaving, setEditSaving]     = useState(false);

  // ── Hard delete project state (admin-only) ─────────────────
  const [deleteModal, setDeleteModal]   = useState(null); // project object to delete

  // ── Document attachment state ──────────────────────────────
  const [attachPanel, setAttachPanel]   = useState(null);  // subtaskId currently open
  const [attachData, setAttachData]     = useState({});    // { subtaskId: { docs, infra, loading } }
  const [pickerModal, setPickerModal]   = useState(null);  // { type:'doc'|'infra', subtaskId, customerId }
  const [pickerItems, setPickerItems]   = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const pickerFileRef = useRef(null);

  // ── Phase 2 — inline edit/delete state ────────────────────
  // Subtask rename: { subtaskId, value }
  const [editingSubtask, setEditingSubtask] = useState(null);
  // Subtask delete confirm: { subtaskId, projectId, groupId }
  const [confirmDeleteSub, setConfirmDeleteSub] = useState(null);
  // Group rename: { groupId, value }
  const [editingGroup, setEditingGroup] = useState(null);
  // Group delete confirm: { groupId, projectId, groupName, subtaskCount }
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  // Add phase modal: { projectId }
  const [addGroupModal, setAddGroupModal] = useState(null);
  const [newGroupName, setNewGroupName]   = useState("");

  const [form, setForm] = useState({
    customer_id: "", name: "", subtitle: "",
    type: "Implementation", owner_id: "",
    due_date: "", status: "On Track",
  });
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  // ── Load list ──────────────────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const [p, c, t] = await Promise.all([getProjects(), getCustomers(), getTeam()]);
      setProjects(p);
      // Deduplicate customers by name as a UI-level safeguard
      const seen = new Set();
      setCustomers(c.filter((cust) => {
        if (seen.has(cust.name)) return false;
        seen.add(cust.name);
        return true;
      }));
      setTeam(t);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // F-2: auto-expand project when navigated from MyTasks
  useEffect(() => {
    const pid = location.state?.expandedProjectId;
    if (pid && !loading) {
      toggleProject(pid);
      window.history.replaceState({}, "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, loading]);

  // ── Expand project ─────────────────────────────────────────
  const toggleProject = async (id) => {
    if (expandedProjectId === id) { setExpandedProjectId(null); return; }
    setExpandedProjectId(id);
    if (expandedData[id]) return;
    try {
      const full = await getProject(id);
      setExpandedData((prev) => ({ ...prev, [id]: full }));
      const collapsed = {};
      (full.groups ?? []).forEach((g) => { collapsed[`${id}_${g.id}`] = true; });
      setCollapsedTasks((prev) => ({ ...prev, ...collapsed }));
    } catch (err) { showError(err.message); }
  };

  // ── Reload after mutation ──────────────────────────────────
  const reloadExpanded = async (projectId) => {
    try {
      // P-2 fix: only re-fetch the single expanded project's full tree,
      // then update the project list entry locally from the returned data
      // instead of fetching all projects.
      const [full, list] = await Promise.all([getProject(projectId), getProjects()]);
      setExpandedData((prev) => ({ ...prev, [projectId]: full }));
      setProjects(list);
      // F-1 fix: invalidate attachment cache for all subtasks in this project
      // so the panel re-fetches fresh data next time it's opened.
      setAttachData((prev) => {
        const next = { ...prev };
        (full.groups ?? []).forEach((g) => {
          (g.subtasks ?? []).forEach((s) => { delete next[s.id]; });
        });
        return next;
      });
    } catch (err) { showError(err.message); }
  };

  // ── Toggle subtask checkbox ────────────────────────────────
  // F1.5: checkbox → "Done" when checked, "In Progress" when unchecked
  const toggleSubtask = async (projectId, subtaskId, currentStatus) => {
    const newStatus = currentStatus === "Done" ? "In Progress" : "Done";
    try {
      await updateSubtask(subtaskId, { status: newStatus });
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Status badge pick ──────────────────────────────────────
  // F1.4: picking a status calls PUT /api/subtasks/:id with { status }
  const handleStatusPick = async (projectId, subtaskId, newStatus) => {
    try {
      await updateSubtask(subtaskId, { status: newStatus });
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Update subtask due date ────────────────────────────────
  const updateSubtaskDate = async (projectId, subtaskId, date) => {
    try {
      await updateSubtask(subtaskId, { due_date: date || null });
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Flag save / clear ──────────────────────────────────────
  const handleFlagSave = async (data) => {
    const { subtask, projectId } = flagModal;
    try {
      await updateSubtask(subtask.id, data);
      setFlagModal(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  const handleFlagClear = async (data) => {
    const { subtask, projectId } = flagModal;
    try {
      await updateSubtask(subtask.id, data);
      setFlagModal(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Add subtask inline ─────────────────────────────────────
  const commitAddSubtask = async (projectId, groupId) => {
    const key   = `${projectId}_${groupId}`;
    const title = (addingSubtask[key] || "").trim();
    if (!title) return;
    try {
      const group    = expandedData[projectId]?.groups?.find((g) => g.id === groupId);
      const position = group ? group.subtasks.length : 0;
      await createSubtask(groupId, { name: title, position });
      setAddingSubtask((prev) => ({ ...prev, [key]: "" }));
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Add project ────────────────────────────────────────────
  const handleAddProject = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { id } = await createProject({
        ...form,
        customer_id: Number(form.customer_id),
        owner_id: form.owner_id ? Number(form.owner_id) : null,
        initial_member_ids: selectedMemberIds,
      });
      setShowModal(false);
      setForm({ customer_id: "", name: "", subtitle: "", type: "Implementation", owner_id: "", due_date: "", status: "On Track" });
      setSelectedMemberIds([]);
      await loadList();
      setExpandedProjectId(id);
      const full = await getProject(id);
      setExpandedData((prev) => ({ ...prev, [id]: full }));
      const collapsed = {};
      (full.groups ?? []).forEach((g) => { collapsed[`${id}_${g.id}`] = true; });
      setCollapsedTasks((prev) => ({ ...prev, ...collapsed }));
    } catch (err) { showError(err.message); }
    finally { setSaving(false); }
  };

  const toggleTaskCollapse = (projectId, groupId) => {
    const key = `${projectId}_${groupId}`;
    setCollapsedTasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Phase 2 — Subtask rename ───────────────────────────────
  const commitRenameSubtask = async (projectId, subtaskId) => {
    const name = (editingSubtask?.value ?? "").trim();
    if (!name) { setEditingSubtask(null); return; }
    try {
      await updateSubtask(subtaskId, { name });
      setEditingSubtask(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Phase 2 — Subtask delete ───────────────────────────────
  const commitDeleteSubtask = async () => {
    const { subtaskId, projectId } = confirmDeleteSub;
    try {
      await deleteSubtask(subtaskId);
      setConfirmDeleteSub(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Phase 2 — Group rename ─────────────────────────────────
  const commitRenameGroup = async (projectId, groupId) => {
    const name = (editingGroup?.value ?? "").trim();
    if (!name) { setEditingGroup(null); return; }
    try {
      // B-6 fix: don't pass position — service now only updates provided fields
      await updateGroup(groupId, { name });
      setEditingGroup(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Phase 2 — Group delete ─────────────────────────────────
  const commitDeleteGroup = async () => {
    const { groupId, projectId } = confirmDeleteGroup;
    try {
      await deleteGroup(groupId);
      setConfirmDeleteGroup(null);
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Phase 2 — Add group (phase) ────────────────────────────
  const commitAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    const { projectId } = addGroupModal;
    try {
      const groups = expandedData[projectId]?.groups ?? [];
      await createGroup(projectId, { name, position: groups.length });
      setAddGroupModal(null);
      setNewGroupName("");
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Phase 3 — Assign subtask (multi-user) ────────────────
  const handleAssign = async (projectId, subtaskId, assigneeIds) => {
    try {
      // assigneeIds is an array; send as assignee_ids for syncAssignees path
      await updateSubtask(subtaskId, { assignee_ids: assigneeIds, _changedBy: user?.id });
      await reloadExpanded(projectId);
    } catch (err) { showError(err.message); }
  };

  // ── Edit project ───────────────────────────────────────────
  const openEditModal = (project) => {
    setEditForm({
      name:        project.name        ?? "",
      subtitle:    project.subtitle    ?? "",
      type:        project.type        ?? "Implementation",
      owner_id:    project.owner_id    ?? "",
      status:      project.status      ?? "On Track",
      start_date:  project.start_date  ? project.start_date.split("T")[0] : "",
      due_date:    project.due_date    ? project.due_date.split("T")[0]   : "",
      notes:       project.notes       ?? "",
    });
    setEditModal(project);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await updateProject(editModal.id, {
        ...editForm,
        owner_id:   editForm.owner_id   ? Number(editForm.owner_id)   : null,
        start_date: editForm.start_date || null,
        due_date:   editForm.due_date   || null,
        notes:      editForm.notes      || null,
      });
      setEditModal(null);
      await reloadExpanded(editModal.id);
    } catch (err) { showError(err.message); }
    finally { setEditSaving(false); }
  };

  // ── Hard delete project (admin-only) ──────────────────────
  const handleHardDeleteProject = async () => {
    await hardDeleteProject(deleteModal.id);
    setDeleteModal(null);
    setExpandedProjectId(null);
    await loadList();
  };

  // ── View customer profile ──────────────────────────────────
  const viewCustomerProfile = (customerId) => {    // Navigate to /customers with the customer id in state so the drawer opens
    navigate("/customers", { state: { openCustomerId: customerId } });
  };

  // ── Attachment panel handlers ──────────────────────────────
  const toggleAttachPanel = async (subtaskId, customerId) => {
    if (attachPanel === subtaskId) { setAttachPanel(null); return; }
    setAttachPanel(subtaskId);
    if (attachData[subtaskId]) return; // already loaded
    setAttachData((prev) => ({ ...prev, [subtaskId]: { docs: [], infra: [], loading: true } }));
    try {
      const [docs, infra] = await Promise.all([
        getEntityDocs("subtask", subtaskId),
        getEntityInfra("subtask", subtaskId),
      ]);
      setAttachData((prev) => ({ ...prev, [subtaskId]: { docs, infra, loading: false } }));
    } catch (err) {
      showError(err.message);
      setAttachData((prev) => ({ ...prev, [subtaskId]: { docs: [], infra: [], loading: false } }));
    }
  };
  const refreshAttachments = async (subtaskId) => {
    try {
      const [docs, infra] = await Promise.all([
        getEntityDocs("subtask", subtaskId),
        getEntityInfra("subtask", subtaskId),
      ]);
      setAttachData((prev) => ({ ...prev, [subtaskId]: { docs, infra, loading: false } }));
    } catch (err) { showError(err.message); }
  };

  const openPicker = async (type, subtaskId, customerId) => {
    setPickerLoading(true);
    setPickerModal({ type, subtaskId, customerId });
    try {
      const items = type === "doc"
        ? await getPickerDocs(customerId)
        : await getPickerInfra(customerId);
      setPickerItems(items);
    } catch (err) { showError(err.message); }
    finally { setPickerLoading(false); }
  };

  const handlePickerAttach = async (itemId) => {
    const { type, subtaskId } = pickerModal;
    try {
      if (type === "doc") {
        await linkDocument({ document_id: itemId, entity_type: "subtask", entity_id: subtaskId });
      } else {
        await linkInfra({ infra_id: itemId, entity_type: "subtask", entity_id: subtaskId });
      }
      await refreshAttachments(subtaskId);
      setPickerModal(null);
    } catch (err) { showError(err.message); }
  };

  const handleUnlinkDoc = async (subtaskId, documentId) => {
    try {
      await unlinkDocument({ document_id: documentId, entity_type: "subtask", entity_id: subtaskId });
      await refreshAttachments(subtaskId);
    } catch (err) { showError(err.message); }
  };

  const handleUnlinkInfra = async (subtaskId, infraId) => {
    try {
      await unlinkInfra({ infra_id: infraId, entity_type: "subtask", entity_id: subtaskId });
      await refreshAttachments(subtaskId);
    } catch (err) { showError(err.message); }
  };

  // ── Upload a new file directly from the picker modal ──────
  const handlePickerFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pickerModal) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Upload to customer, then link to subtask
      const result = await uploadDocument(pickerModal.customerId, fd);
      await linkDocument({
        document_id: result.id,
        entity_type: "subtask",
        entity_id: pickerModal.subtaskId,
      });
      await refreshAttachments(pickerModal.subtaskId);
      // Refresh picker list
      const updated = await getPickerDocs(pickerModal.customerId);
      setPickerItems(updated);
      if (pickerFileRef.current) pickerFileRef.current.value = "";
    } catch (err) { showError(err.message); }
    finally { setUploadingFile(false); }
  };

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (activeTab     !== "All") list = list.filter((p) => p.type        === activeTab);
    if (filterStatus  !== "All") list = list.filter((p) => p.status      === filterStatus);
    if (filterOwner   !== "All") list = list.filter((p) => p.owner_name  === filterOwner);
    return list;
  }, [activeTab, filterStatus, filterOwner, projects]);

  const remeasureKey = `${expandedProjectId}|${expandedData[expandedProjectId]?.groups?.length ?? 0}`;

  const projectEstimateSize = (index) => {
    const p = filteredProjects[index];
    if (!p) return 100;
    return expandedProjectId === p.id ? 480 : 100;
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div>
      <Sidebar />
      <PageShell
        className={styles.page}
        chrome={
          <>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Projects</h1>
            <p className={styles.subtitle}>All project types with task tracking</p>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.date}>{todayLabel}</span>
            {ASSIGNER_ROLES.includes(user?.role) && (
              <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ Add Project</button>
            )}
          </div>
        </div>

        {/* Type tabs */}
        <div className={styles.tabsBar}>
          {typeTabs.map((tab) => (
            <button key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className={styles.filterRow}>
          <div className={styles.filterLeft}>
            <span className={styles.filterLabel}>Filter:</span>
            <select className={styles.select} value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All statuses</option>
              {["On Track","At Risk","Delayed","Completed","On Hold","Prospecting"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className={styles.select} value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}>
              <option value="All">All owners</option>
              {team.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.count}>{filteredProjects.length} projects</div>
        </div>
          </>
        }
      >
        {loading ? (
          <PageSkeleton variant="list" rows={6} className={styles.listSkeleton} />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No projects found"
            message="No projects match the current filters. Try adjusting search or filters."
          />
        ) : (
          <VirtualList
            items={filteredProjects}
            className={styles.listViewport}
            innerClassName={styles.list}
            remeasureDep={remeasureKey}
            estimateSize={projectEstimateSize}
            getItemKey={(p) => p.id}
            renderItem={(project) => {
              const isOpen   = expandedProjectId === project.id;
              const full     = expandedData[project.id];
              const progress = project.progress ?? 0;

              return (
                <div key={project.id} className={styles.card}>
                  {/* Card header row */}
                  <div
                    className={styles.cardTop}
                    onClick={() => toggleProject(project.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleProject(project.id);
                      }
                    }}
                    aria-label={`Expand project ${project.customer_name}`}
                  >
                    <div className={styles.customerCol}>
                      <div className={styles.customerName}>{project.customer_name}</div>
                      <div className={styles.customerSub}>{project.subtitle}</div>
                    </div>
                    <div className={styles.typeCol}>
                      <span className={`${styles.typePill} ${getTypeClass(project.type)}`}>
                        {project.type}
                      </span>
                    </div>
                    <div className={styles.ownerCol}>
                      {project.owner_name
                        ? <><span className={styles.avatar}>{project.owner_name[0]}</span><span>{project.owner_name}</span></>
                        : <span className={styles.unassigned}>Unassigned</span>}
                    </div>
                    <div className={styles.progressCol}>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                      </div>
                      <span>{progress}%</span>
                    </div>
                    <div className={styles.statusCol}>
                      <span className={`${styles.statusPill} ${styles[`status_${project.status?.replace(/\s/g, "")}`]}`}>
                        {project.status}
                      </span>
                    </div>
                    <div className={styles.dueCol}>{formatDate(project.due_date)}</div>
                    <div className={styles.chevron}>{isOpen ? "▴" : "▾"}</div>
                  </div>

                  {/* Expanded task tree */}
                  {isOpen && full && (
                    <div className={styles.expanded}>
                      <div className={styles.expandedTop}>
                        <div>
                          {(full.groups ?? []).reduce((s, g) => s + g.completed, 0)}/
                          {(full.groups ?? []).reduce((s, g) => s + g.total, 0)} sub-tasks completed
                        </div>
                        {/* Unassigned warning banner */}
                        {full.unassigned_count > 0 && full.owner_name && (
                          <div className={styles.unassignedBanner}>
                            ⚠ {full.unassigned_count} subtask{full.unassigned_count !== 1 ? "s" : ""} have no explicit assignee — defaulting to project owner <strong>{full.owner_name}</strong>
                          </div>
                        )}
                        <div className={styles.actionGroup}>
                          <button className={styles.secondaryBtn} onClick={() => openEditModal(project)}>
                            Edit project
                          </button>
                          <button className={styles.secondaryBtn} onClick={() => viewCustomerProfile(project.customer_id)}>
                            View customer profile
                          </button>
                          {user?.role === "ADMIN" && (
                            <button
                              className={styles.dangerBtn}
                              onClick={() => setDeleteModal(project)}
                              title="Permanently delete this project"
                            >
                              Delete project
                            </button>
                          )}
                        </div>
                      </div>

                      <div className={styles.tasksWrap}>
                        {(full.groups ?? []).map((group) => {
                          const taskPercent  = group.total ? Math.round((group.completed / group.total) * 100) : 0;
                          const isCollapsed  = collapsedTasks[`${project.id}_${group.id}`] === true;
                          const addKey       = `${project.id}_${group.id}`;
                          const addValue     = addingSubtask[addKey] || "";
                          // F1.13 — flag count badge on group header
                          const flagCount    = (group.subtasks ?? []).filter((s) => s.flag_type).length;
                          const isEditingThisGroup = editingGroup?.groupId === group.id;

                          return (
                            <div key={group.id} className={styles.taskCard}>
                              {/* Group header — F2.10 pencil, F2.12 delete */}
                              <div
                                className={styles.taskHeader}
                                onClick={() => {
                                  if (isEditingThisGroup) return;
                                  toggleTaskCollapse(project.id, group.id);
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (isEditingThisGroup) return;
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    toggleTaskCollapse(project.id, group.id);
                                  }
                                }}
                                aria-label={`Toggle phase ${group.name}`}
                              >
                                <div className={styles.taskTitleRow}>
                                  {isEditingThisGroup ? (
                                    // F2.10/F2.11 — inline rename input
                                    <input
                                      autoFocus
                                      className={styles.inlineEditInput}
                                      value={editingGroup.value}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setEditingGroup({ ...editingGroup, value: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")  commitRenameGroup(project.id, group.id);
                                        if (e.key === "Escape") setEditingGroup(null);
                                      }}
                                      onBlur={() => commitRenameGroup(project.id, group.id)}
                                    />
                                  ) : (
                                    <>
                                      <span className={styles.taskTitle}>{group.name}</span>
                                      {flagCount > 0 && (
                                        <span className={styles.groupFlagBadge} title={`${flagCount} flagged step(s)`}>
                                          ⚑ {flagCount}
                                        </span>
                                      )}
                                      {/* F2.10 — pencil icon (hover) */}
                                      <button
                                        className={styles.iconBtn}
                                        title="Rename phase"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingGroup({ groupId: group.id, value: group.name });
                                        }}
                                      >✎</button>
                                      {/* F2.12 — delete icon (hover) */}
                                      <button
                                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                        title="Delete phase"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setConfirmDeleteGroup({
                                            groupId: group.id,
                                            projectId: project.id,
                                            groupName: group.name,
                                            subtaskCount: group.total,
                                          });
                                        }}
                                      >✕</button>
                                    </>
                                  )}
                                </div>
                                <div className={styles.taskMeta} onClick={(e) => e.stopPropagation()}>
                                  <span>{group.completed}/{group.total}</span>
                                  <div className={styles.smallProgress}>
                                    <div className={styles.smallProgressFill} style={{ width: `${taskPercent}%` }} />
                                  </div>
                                  <span className={styles.collapseBtn}>{isCollapsed ? "▾" : "▴"}</span>
                                </div>
                              </div>

                              {/* Subtask list */}
                              {!isCollapsed && (
                                <div className={styles.subtaskBody}>
                                  {group.subtasks.length > 0 ? (
                                    <div className={styles.subtaskList}>
                                      {group.subtasks.map((subtask) => {
                                        const isDone    = subtask.status === "Done";
                                        const isFlagged = !!subtask.flag_type;
                                        const flagTitle = isFlagged
                                          ? `${subtask.flag_type}${subtask.flag_reason ? ": " + subtask.flag_reason : ""}`
                                          : "Flag this step";
                                        const isEditingThis = editingSubtask?.subtaskId === subtask.id;
                                        const isConfirmingDelete = confirmDeleteSub?.subtaskId === subtask.id;

                                        return (
                                          <div key={subtask.id} className={styles.subtaskRowWrap}>
                                          <div className={`${styles.subtaskRow} ${styles.subtaskRowHoverable}`}>
                                            {/* Checkbox */}
                                            <span
                                              className={`${styles.checkbox} ${isDone ? styles.checkboxDone : ""}`}
                                              role="checkbox"
                                              aria-checked={isDone}
                                              tabIndex={0}
                                              onClick={(e) => { e.stopPropagation(); toggleSubtask(project.id, subtask.id, subtask.status); }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  toggleSubtask(project.id, subtask.id, subtask.status);
                                                }
                                              }}
                                            >
                                              {isDone ? "✓" : ""}
                                            </span>

                                            {/* Name — F2.4/F2.5 inline edit */}
                                            {isEditingThis ? (                                              <input
                                                autoFocus
                                                className={styles.inlineEditInput}
                                                value={editingSubtask.value}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => setEditingSubtask({ ...editingSubtask, value: e.target.value })}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter")  commitRenameSubtask(project.id, subtask.id);
                                                  if (e.key === "Escape") setEditingSubtask(null);
                                                }}
                                                onBlur={() => commitRenameSubtask(project.id, subtask.id)}
                                              />
                                            ) : isConfirmingDelete ? (
                                              // F2.6 — inline delete confirm
                                              <span className={styles.deleteConfirmRow}>
                                                <span className={styles.deleteConfirmText}>Delete?</span>
                                                <button className={styles.confirmYesBtn}
                                                  onClick={(e) => { e.stopPropagation(); commitDeleteSubtask(); }}>Yes</button>
                                                <button className={styles.confirmNoBtn}
                                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteSub(null); }}>No</button>
                                              </span>
                                            ) : (
                                              <span className={`${styles.subtaskTitle} ${isDone ? styles.subtaskDone : ""}`}>
                                                {subtask.name}
                                                {/* F2.4 — pencil on hover */}
                                                <button
                                                  className={`${styles.iconBtn} ${styles.subtaskIconBtn}`}
                                                  title="Rename step"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingSubtask({ subtaskId: subtask.id, value: subtask.name });
                                                  }}
                                                >✎</button>
                                                {/* F2.6 — delete on hover */}
                                                <button
                                                  className={`${styles.iconBtn} ${styles.subtaskIconBtn} ${styles.iconBtnDanger}`}
                                                  title="Delete step"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDeleteSub({ subtaskId: subtask.id, projectId: project.id });
                                                  }}
                                                >✕</button>
                                              </span>
                                            )}

                                            {/* Assignee multi-picker — stacked avatars, click to assign/remove */}
                                            <div
                                              style={{ display: "flex", alignItems: "center", position: "relative" }}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              {ASSIGNER_ROLES.includes(user?.role) ? (
                                                <AssigneeMultiPicker
                                                  currentAssignees={subtask.assignees ?? []}
                                                  inherited={!!subtask.inherited}
                                                  team={team}
                                                  onSave={(ids) => handleAssign(project.id, subtask.id, ids)}
                                                />
                                              ) : (
                                                /* Read-only stacked avatars for non-assigners */
                                                <div style={{ display: "flex", alignItems: "center" }}>
                                                  {(subtask.assignees ?? []).slice(0, 3).map((a, idx) => (
                                                    <span
                                                      key={a.user_id}
                                                      title={a.user_name}
                                                      style={{
                                                        width: 24, height: 24, borderRadius: "50%",
                                                        background: "var(--gradient-avatar)",
                                                        color: "var(--blue-text)",
                                                        fontSize: 10, fontWeight: 700,
                                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                                        border: "2px solid var(--bg-surface)",
                                                        marginLeft: idx === 0 ? 0 : -6,
                                                        zIndex: 3 - idx, position: "relative", flexShrink: 0,
                                                      }}
                                                    >
                                                      {a.user_name?.[0]?.toUpperCase()}
                                                    </span>
                                                  ))}
                                                  {(subtask.assignees ?? []).length === 0 && (
                                                    <span
                                                      className={styles.assigneeChip}
                                                      style={{ cursor: "default", background: "none" }}
                                                    >—</span>
                                                  )}
                                                  {(subtask.assignees ?? []).length > 3 && (
                                                    <span style={{
                                                      width: 24, height: 24, borderRadius: "50%",
                                                      background: "var(--bg-elevated)", color: "var(--text-muted)",
                                                      fontSize: 8, fontWeight: 700,
                                                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                                                      border: "2px solid var(--bg-surface)", marginLeft: -6, flexShrink: 0,
                                                    }}>
                                                      +{(subtask.assignees ?? []).length - 3}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                            {/* Due date */}
                                            <input
                                              type="date"
                                              className={styles.dateInput}
                                              value={subtask.due_date ? subtask.due_date.split("T")[0] : ""}
                                              onClick={(e) => e.stopPropagation()}
                                              onChange={(e) => updateSubtaskDate(project.id, subtask.id, e.target.value)}
                                            />

                                            {/* Status badge */}
                                            <StatusBadge
                                              status={subtask.status}
                                              onSelect={(s) => handleStatusPick(project.id, subtask.id, s)}
                                            />

                                            {/* Flag icon */}
                                            <FlagIcon
                                              flagged={isFlagged}
                                              title={flagTitle}
                                              onClick={() => setFlagModal({ subtask, projectId: project.id })}
                                            />

                                            {/* Attachment toggle */}
                                            <span
                                              className={`${styles.attachIcon} ${attachPanel === subtask.id ? styles.attachIconActive : ""}`}
                                              title="Attachments"
                                              role="button"
                                              tabIndex={0}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleAttachPanel(subtask.id, project.customer_id);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  toggleAttachPanel(subtask.id, project.customer_id);
                                                }
                                              }}
                                            >📎</span>
                                          </div>

                                          {/* ── Attachments panel ── */}
                                          {attachPanel === subtask.id && (
                                            <div className={styles.attachPanel} onClick={(e) => e.stopPropagation()}>
                                              {attachData[subtask.id]?.loading ? (
                                                <div className={styles.attachLoading}>Loading…</div>
                                              ) : (
                                                <>
                                                  {/* Documents section */}
                                                  <div className={styles.attachSection}>
                                                    <div className={styles.attachSectionHeader}>
                                                      <span className={styles.attachSectionTitle}>📄 Documents</span>
                                                      <button
                                                        className={styles.attachAddBtn}
                                                        onClick={() => openPicker("doc", subtask.id, project.customer_id)}
                                                      >+ Attach</button>
                                                    </div>
                                                    {(attachData[subtask.id]?.docs ?? []).length === 0 ? (
                                                      <div className={styles.attachEmpty}>No documents attached</div>
                                                    ) : (
                                                      <div className={styles.attachList}>
                                                        {(attachData[subtask.id]?.docs ?? []).map((doc) => (
                                                          <div key={`${doc.id}-${doc.source}`} className={styles.attachItem}>
                                                            <div className={styles.attachItemMain}>
                                                              <span className={styles.attachItemName}>
                                                                {doc.link
                                                                  ? <a href={doc.link} target="_blank" rel="noreferrer" className={styles.attachLink}>{doc.name}</a>
                                                                  : doc.name}
                                                              </span>
                                                              <span className={styles.attachItemMeta}>{doc.type} · {doc.status}</span>
                                                            </div>
                                                            <span className={`${styles.attachSource} ${doc.scope === "inherited" ? styles.attachInherited : styles.attachDirect}`}>
                                                              {doc.source}
                                                            </span>
                                                            {doc.scope === "direct" && (
                                                              <button
                                                                className={styles.attachUnlink}
                                                                title="Unlink"
                                                                onClick={() => handleUnlinkDoc(subtask.id, doc.id)}
                                                              >✕</button>
                                                            )}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>

                                                  {/* Infrastructure section */}
                                                  <div className={styles.attachSection}>
                                                    <div className={styles.attachSectionHeader}>
                                                      <span className={styles.attachSectionTitle}>🖥 Infrastructure</span>
                                                      <button
                                                        className={styles.attachAddBtn}
                                                        onClick={() => openPicker("infra", subtask.id, project.customer_id)}
                                                      >+ Attach</button>
                                                    </div>
                                                    {(attachData[subtask.id]?.infra ?? []).length === 0 ? (
                                                      <div className={styles.attachEmpty}>No infrastructure attached</div>
                                                    ) : (
                                                      <div className={styles.attachList}>
                                                        {(attachData[subtask.id]?.infra ?? []).map((srv) => (
                                                          <div key={`${srv.id}-${srv.source}`} className={styles.attachItem}>
                                                            <div className={styles.attachItemMain}>
                                                              <span className={styles.attachItemName}>{srv.hostname}</span>
                                                              <span className={styles.attachItemMeta}>{srv.role} · {srv.environment}{srv.ip_address ? ` · ${srv.ip_address}` : ""}</span>
                                                            </div>
                                                            <span className={`${styles.attachSource} ${srv.scope === "inherited" ? styles.attachInherited : styles.attachDirect}`}>
                                                              {srv.source}
                                                            </span>
                                                            {srv.scope === "direct" && (
                                                              <button
                                                                className={styles.attachUnlink}
                                                                title="Unlink"
                                                                onClick={() => handleUnlinkInfra(subtask.id, srv.id)}
                                                              >✕</button>
                                                            )}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className={styles.emptySubtasks}>No subtasks added yet.</div>
                                  )}

                                  {/* F2.1/F2.2/F2.3 — inline add subtask */}
                                  <div className={styles.addSubtaskRow} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      className={styles.addSubtaskInput}
                                      placeholder="+ Add step…"
                                      value={addValue}
                                      onChange={(e) => setAddingSubtask((prev) => ({ ...prev, [addKey]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === "Enter") commitAddSubtask(project.id, group.id); }}
                                    />
                                    <button className={styles.addSubtaskBtn}
                                      onClick={() => commitAddSubtask(project.id, group.id)}>
                                      Add
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* F2.8 — + Add phase button */}
                        <button
                          className={styles.addPhaseBtn}
                          onClick={() => { setAddGroupModal({ projectId: project.id }); setNewGroupName(""); }}
                        >
                          + Add phase
                        </button>
                      </div>
                    </div>
                  )}

                  {isOpen && !full && (
                    <div className={styles.expanded}>
                      <PageSkeleton variant="compact" />
                    </div>
                  )}
                </div>
              );
            }}
          />
        )}
      </PageShell>

        {/* Flag Modal — F1.8 / F1.9 / F1.10 / F1.11 */}
        {flagModal && (
          <FlagModal
            subtask={flagModal.subtask}
            onSave={handleFlagSave}
            onClear={handleFlagClear}
            onClose={() => setFlagModal(null)}
          />
        )}

        {/* ── Hard Delete Project Modal (admin-only) ─────────── */}
        {deleteModal && (
          <DeleteConfirmModal
            entityType="project"
            entityName={deleteModal.customer_name || deleteModal.name}
            description={`This will permanently delete the project "${deleteModal.customer_name || deleteModal.name}", all its phases, tasks, subtasks, assignments, and time logs. This cannot be undone.`}
            onConfirm={handleHardDeleteProject}
            onClose={() => setDeleteModal(null)}
          />
        )}

        {/* ── Edit Project Modal ─────────────────────────────── */}
        {editModal && (
          <div className={styles.modalOverlay} onClick={() => setEditModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Edit Project</h2>
                <button className={styles.closeBtn} onClick={() => setEditModal(null)}>×</button>
              </div>
              <form className={styles.form} onSubmit={handleEditSave}>
                <div className={styles.field}>
                  <label>Project name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="e.g. HDFC Bank Implementation"
                  />
                </div>
                <div className={styles.field}>
                  <label>Subtitle</label>
                  <input
                    type="text"
                    value={editForm.subtitle}
                    onChange={(e) => setEditForm({ ...editForm, subtitle: e.target.value })}
                    placeholder="e.g. Phase 2 – PAM vault config"
                  />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Type</label>
                    <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                      <option>Implementation</option>
                      <option>Managed Service</option>
                      <option>License Renewal</option>
                      <option>New Opportunity</option>
                    </select>
                  </div>
                  {["ADMIN", "LEAD"].includes(user?.role) ? (
                    <div className={styles.field}>
                      <label>Owner</label>
                      <select value={editForm.owner_id} onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}>
                        <option value="">Unassigned</option>
                        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className={styles.field}>
                      <label>Owner</label>
                      <input
                        type="text"
                        value={team.find((m) => m.id === Number(editForm.owner_id))?.name ?? "Unassigned"}
                        disabled
                        style={{ opacity: 0.5, cursor: "not-allowed" }}
                      />
                    </div>
                  )}
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Status</label>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option>On Track</option>
                      <option>At Risk</option>
                      <option>Delayed</option>
                      <option>Completed</option>
                      <option>On Hold</option>
                      <option>Prospecting</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Notes</label>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    placeholder="Any notes about this project…"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setEditModal(null)}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={editSaving}>
                    {editSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* F2.8/F2.9 — Add phase modal */}
        {addGroupModal && (
          <div className={styles.modalOverlay} onClick={() => setAddGroupModal(null)}>
            <div className={styles.modal} style={{ width: "min(420px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Add Phase</h2>
                <button className={styles.closeBtn} onClick={() => setAddGroupModal(null)}>×</button>
              </div>
              <div className={styles.form} style={{ padding: "20px" }}>
                <div className={styles.field}>
                  <label>Phase name</label>
                  <input
                    autoFocus
                    placeholder="e.g. Vault Configuration"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitAddGroup(); }}
                  />
                </div>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={() => setAddGroupModal(null)}>Cancel</button>
                  <button className={styles.saveBtn} onClick={commitAddGroup}>Add Phase</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* F2.12/F2.13 — Delete group confirm */}
        {confirmDeleteGroup && (
          <div className={styles.modalOverlay} onClick={() => setConfirmDeleteGroup(null)}>
            <div className={styles.modal} style={{ width: "min(420px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Delete Phase</h2>
                <button className={styles.closeBtn} onClick={() => setConfirmDeleteGroup(null)}>×</button>
              </div>
              <div className={styles.form} style={{ padding: "20px" }}>
                <p style={{ color: "#94a3b8", marginBottom: "20px", lineHeight: 1.6 }}>
                  Delete <strong style={{ color: "#f1f5f9" }}>{confirmDeleteGroup.groupName}</strong> and all{" "}
                  <strong style={{ color: "#f87171" }}>{confirmDeleteGroup.subtaskCount} step(s)</strong>?
                  This cannot be undone.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDeleteGroup(null)}>Cancel</button>
                  <button
                    style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "12px", padding: "11px 16px", cursor: "pointer", fontWeight: 700 }}
                    onClick={commitDeleteGroup}
                  >
                    Delete Phase
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Attachment Picker Modal ───────────────────────── */}
        {pickerModal && (
          <div className={styles.modalOverlay} onClick={() => setPickerModal(null)}>
            <div className={styles.modal} style={{ width: "min(520px,100%)" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{pickerModal.type === "doc" ? "Attach Document" : "Attach Infrastructure"}</h2>
                <button className={styles.closeBtn} onClick={() => setPickerModal(null)}>×</button>
              </div>
              <div className={styles.form} style={{ padding: "20px" }}>
                {pickerLoading ? (
                  <PageSkeleton variant="list" rows={4} />
                ) : pickerItems.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: "14px", padding: "12px 0" }}>
                    {pickerModal.type === "doc"
                      ? "No documents found for this customer. Upload a file below or add documents in the Customer Profile first."
                      : "No infrastructure found for this customer. Add servers in the Customer Profile first."}
                  </div>
                ) : (
                  <div className={styles.pickerList}>
                    {pickerItems.map((item) => (
                      <div
                        key={item.id}
                        className={styles.pickerItem}
                        onClick={() => handlePickerAttach(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            handlePickerAttach(item.id);
                          }
                        }}
                      >
                        <span className={styles.pickerItemIcon}>
                          {pickerModal.type === "doc" ? "📄" : "🖥"}
                        </span>
                        <div className={styles.pickerItemText}>
                          <div className={styles.pickerItemName}>{item.name ?? item.hostname}</div>
                          <div className={styles.pickerItemMeta}>
                            {pickerModal.type === "doc"
                              ? `${item.type} · ${item.status}`
                              : `${item.role} · ${item.environment}`}
                          </div>
                        </div>
                        <span className={styles.pickerAttachBtn}>Attach →</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Upload new file (doc picker only) ── */}
                {pickerModal.type === "doc" && (
                  <div className={styles.pickerUploadSection}>
                    <div className={styles.pickerUploadLabel}>
                      — or upload a new file —
                    </div>
                    <label className={styles.pickerFileLabel}>
                      <input
                        ref={pickerFileRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.svg,.txt"
                        style={{ display: "none" }}
                        onChange={handlePickerFileUpload}
                        disabled={uploadingFile}
                      />
                      <span className={styles.pickerFileLabelText}>
                        {uploadingFile ? "Uploading…" : "📁 Choose file to upload & attach"}
                      </span>
                    </label>
                    <div style={{ fontSize: "11px", color: "#334155", marginTop: "4px" }}>
                      PDF, Word, Excel, images — max 20 MB
                    </div>
                  </div>
                )}

                <div className={styles.modalActions} style={{ marginTop: "16px" }}>
                  <button className={styles.cancelBtn} onClick={() => setPickerModal(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Project Modal */}
        {showModal && (
          <div className={styles.modalOverlay} onClick={() => { setShowModal(false); setSelectedMemberIds([]); }}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Add Project</h2>
                <button className={styles.closeBtn} onClick={() => { setShowModal(false); setSelectedMemberIds([]); }}>×</button>
              </div>
              <form className={styles.form} onSubmit={handleAddProject}>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Customer</label>
                    <select required value={form.customer_id}
                      onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                      <option value="">Select customer…</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Owner</label>
                    <select value={form.owner_id}
                      onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                      <option value="">Unassigned</option>
                      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Project name</label>
                  <input type="text" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. HDFC Bank Implementation" />
                </div>
                <div className={styles.field}>
                  <label>Subtitle</label>
                  <input type="text" value={form.subtitle}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    placeholder="e.g. Phase 2 – PAM vault config" />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Type</label>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      <option>Implementation</option>
                      <option>Managed Service</option>
                      <option>License Renewal</option>
                      <option>New Opportunity</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option>On Track</option>
                      <option>At Risk</option>
                      <option>Delayed</option>
                      <option>Prospecting</option>
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Due Date</label>
                  <input type="date" value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                {/* Initial team members */}
                <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                  <label>Initial Team Members</label>
                  <div style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    padding: "8px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    minHeight: "44px",
                  }}>
                    {team.filter((m) => m.id !== Number(form.owner_id)).map((m) => {
                      const isSelected = selectedMemberIds.includes(m.id);
                      return (
                        <span
                          key={m.id}
                          onClick={() =>
                            setSelectedMemberIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== m.id)
                                : [...prev, m.id]
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                            userSelect: "none",
                            background: isSelected ? "var(--accent-light)" : "var(--bg-surface)",
                            color: isSelected ? "var(--accent-text)" : "var(--text-muted)",
                            border: isSelected
                              ? "1px solid var(--accent-border)"
                              : "1px solid var(--border-subtle)",
                            fontWeight: isSelected ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: "var(--gradient-avatar)",
                            color: "var(--blue-text)",
                            fontSize: 10, fontWeight: 700,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            {m.name[0]}
                          </span>
                          {m.name}
                          {isSelected && <span style={{ fontSize: 11 }}>✓</span>}
                        </span>
                      );
                    })}
                    {team.filter((m) => m.id !== Number(form.owner_id)).length === 0 && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem", padding: "4px 2px" }}>
                        No other team members
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "0.6875rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    Click to toggle. Owner is always a member.
                    {selectedMemberIds.length > 0 && (
                      <strong style={{ color: "var(--accent-text)" }}> {selectedMemberIds.length} selected</strong>
                    )}
                  </p>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => { setShowModal(false); setSelectedMemberIds([]); }}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? "Saving…" : "Save Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
};

export default Projects;
