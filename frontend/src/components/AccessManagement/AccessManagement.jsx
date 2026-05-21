import { useState, useEffect, useCallback } from "react";
import Sidebar from "../sidebar/Sidebar";
import PageSkeleton from "../shared/PageSkeleton";
import EmptyState from "../shared/EmptyState";
import styles from "./AccessManagement.module.css";
import {
  getUserGroups, createUserGroup, updateUserGroup, deleteUserGroup,
  getUserGroupMembers, assignUserToGroup, getUsers,
} from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";

const PRIVILEGE_LEVELS = ["MASTER_ADMIN", "ADMIN", "MANAGER", "MEMBER"];

const PRIVILEGE_COLORS = {
  MASTER_ADMIN: { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  ADMIN:        { bg: "rgba(167,139,250,0.12)", color: "#a78bfa" },
  MANAGER:      { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6" },
  MEMBER:       { bg: "rgba(100,116,139,0.12)", color: "#64748b" },
};

const PRIVILEGE_DESCRIPTIONS = {
  MASTER_ADMIN: "Full system access. Can appoint other admins. Cannot be deleted.",
  ADMIN:        "Full access to all features. Can manage users, groups, and projects.",
  MANAGER:      "Can create/edit projects and assign tasks. Sees only assigned projects.",
  MEMBER:       "Read-only access to projects and tasks they are assigned to. No write access.",
};

const blankGroupForm = { name: "", privilege_level: "MEMBER", description: "" };

export default function AccessManagement() {
  const { showError } = useError();
  const { user: me }  = useAuth();

  const isAdmin = me?.role === "ADMIN";

  const [groups,         setGroups]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [selectedGroup,  setSelectedGroup]  = useState(null);
  const [members,        setMembers]        = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [allUsers,       setAllUsers]       = useState([]);

  // ── Group modal ──────────────────────────────────────────────
  const [groupModal,  setGroupModal]  = useState(null); // null | "create" | "edit"
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm,   setGroupForm]   = useState(blankGroupForm);
  const [groupSaving, setGroupSaving] = useState(false);

  // ── Confirm delete group ─────────────────────────────────────
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);

  // ── Assign user modal ────────────────────────────────────────
  const [assignModal,    setAssignModal]    = useState(false);
  const [assignUserId,   setAssignUserId]   = useState("");
  const [assignSaving,   setAssignSaving]   = useState(false);

  // ── Load groups ──────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const g = await getUserGroups();
      setGroups(g);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Load all users for the assign picker (admin only)
  useEffect(() => {
    if (isAdmin) {
      getUsers({ limit: 200 })
        .then((res) => setAllUsers(res.data ?? []))
        .catch(() => {});
    }
  }, [isAdmin]);

  // ── Load members when a group is selected ────────────────────
  const selectGroup = async (group) => {
    setSelectedGroup(group);
    setMembersLoading(true);
    try {
      const m = await getUserGroupMembers(group.id);
      setMembers(m);
    } catch (err) {
      showError(err.message);
    } finally {
      setMembersLoading(false);
    }
  };

  // ── Open create modal ────────────────────────────────────────
  const openCreate = () => {
    setGroupForm(blankGroupForm);
    setEditingGroup(null);
    setGroupModal("create");
  };

  // ── Open edit modal ──────────────────────────────────────────
  const openEdit = (g) => {
    setGroupForm({
      name:            g.name            ?? "",
      privilege_level: g.privilege_level ?? "MEMBER",
      description:     g.description     ?? "",
    });
    setEditingGroup(g);
    setGroupModal("edit");
  };

  // ── Save group ───────────────────────────────────────────────
  const handleGroupSave = async (e) => {
    e.preventDefault();
    setGroupSaving(true);
    try {
      if (groupModal === "create") {
        await createUserGroup(groupForm);
      } else {
        await updateUserGroup(editingGroup.id, groupForm);
      }
      setGroupModal(null);
      await loadGroups();
      // Refresh selected group if it was edited
      if (editingGroup && selectedGroup?.id === editingGroup.id) {
        const updated = await getUserGroups();
        const fresh = updated.find((g) => g.id === editingGroup.id);
        if (fresh) setSelectedGroup(fresh);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setGroupSaving(false);
    }
  };

  // ── Delete group ─────────────────────────────────────────────
  const handleDeleteGroup = async () => {
    try {
      await deleteUserGroup(confirmDeleteGroup.id);
      setConfirmDeleteGroup(null);
      if (selectedGroup?.id === confirmDeleteGroup.id) {
        setSelectedGroup(null);
        setMembers([]);
      }
      await loadGroups();
    } catch (err) {
      showError(err.message);
    }
  };

  // ── Assign user to selected group ────────────────────────────
  const handleAssignUser = async (e) => {
    e.preventDefault();
    if (!assignUserId || !selectedGroup) return;
    setAssignSaving(true);
    try {
      await assignUserToGroup(selectedGroup.id, Number(assignUserId));
      setAssignModal(false);
      setAssignUserId("");
      // Refresh members
      const m = await getUserGroupMembers(selectedGroup.id);
      setMembers(m);
      await loadGroups(); // refresh member counts
    } catch (err) {
      showError(err.message);
    } finally {
      setAssignSaving(false);
    }
  };

  // Users not already in the selected group (for assign picker)
  const assignableUsers = allUsers.filter(
    (u) => !members.some((m) => m.id === u.id)
  );

  return (
    <div>
      <Sidebar />
      <div className={`${styles.page} app-page-scroll`}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Access &amp; Group Management</h1>
            <p className={styles.subtitle}>
              Control user privileges through groups. Every user must belong to a group.
            </p>
          </div>
          {isAdmin && (
            <button className={styles.addBtn} onClick={openCreate}>+ New Group</button>
          )}
        </div>

        {/* Privilege level legend */}
        <div className={styles.legendRow}>
          {PRIVILEGE_LEVELS.map((level) => {
            const c = PRIVILEGE_COLORS[level];
            return (
              <div key={level} className={styles.legendItem}>
                <span className={styles.legendBadge} style={{ background: c.bg, color: c.color }}>
                  {level}
                </span>
                <span className={styles.legendDesc}>{PRIVILEGE_DESCRIPTIONS[level]}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.layout}>
          {/* Left — group list */}
          <div className={styles.groupList}>
            <div className={styles.groupListHeader}>Groups</div>
            {loading ? (
              <PageSkeleton variant="list" rows={4} />
            ) : groups.length === 0 ? (
              <EmptyState icon="👥" title="No groups yet" message="Create a group to organise access and permissions." compact />
            ) : (
              groups.map((g) => {
                const c = PRIVILEGE_COLORS[g.privilege_level] ?? PRIVILEGE_COLORS.MEMBER;
                const isSelected = selectedGroup?.id === g.id;
                return (
                  <div
                    key={g.id}
                    className={`${styles.groupCard} ${isSelected ? styles.groupCardActive : ""}`}
                    onClick={() => selectGroup(g)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectGroup(g); }
                    }}
                  >
                    <div className={styles.groupCardTop}>
                      <span className={styles.groupName}>{g.name}</span>
                      <span className={styles.groupBadge} style={{ background: c.bg, color: c.color }}>
                        {g.privilege_level}
                      </span>
                    </div>
                    <div className={styles.groupMeta}>
                      <span>{g.member_count} member{g.member_count !== 1 ? "s" : ""}</span>
                      {g.description && <span className={styles.groupDesc}>{g.description}</span>}
                    </div>
                    {isAdmin && g.privilege_level !== "MASTER_ADMIN" && (
                      <div className={styles.groupActions} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.editBtn} onClick={() => openEdit(g)}>Edit</button>
                        <button className={styles.dangerBtn} onClick={() => setConfirmDeleteGroup(g)}>Delete</button>
                      </div>
                    )}
                    {isAdmin && g.privilege_level === "MASTER_ADMIN" && (
                      <div className={styles.groupActions} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.editBtn} onClick={() => openEdit(g)}>Edit</button>
                        <span className={styles.protectedLabel}>Protected</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right — group detail / members */}
          <div className={styles.groupDetail}>
            {!selectedGroup ? (
              <EmptyState
                icon="←"
                title="Select a group"
                message="Choose a group on the left to view and manage its members."
              />
            ) : (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <h2 className={styles.detailTitle}>{selectedGroup.name}</h2>
                    <span
                      className={styles.detailBadge}
                      style={{
                        background: PRIVILEGE_COLORS[selectedGroup.privilege_level]?.bg,
                        color:      PRIVILEGE_COLORS[selectedGroup.privilege_level]?.color,
                      }}
                    >
                      {selectedGroup.privilege_level}
                    </span>
                    {selectedGroup.description && (
                      <p className={styles.detailDesc}>{selectedGroup.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button className={styles.assignBtn} onClick={() => setAssignModal(true)}>
                      + Assign User
                    </button>
                  )}
                </div>

                <div className={styles.memberList}>
                  {membersLoading ? (
                    <PageSkeleton variant="list" rows={3} />
                  ) : members.length === 0 ? (
                    <EmptyState icon="👤" title="No members" message="Assign users to this group to grant access." compact />
                  ) : (
                    members.map((m) => (
                      <div key={m.id} className={styles.memberRow}>
                        <span className={styles.memberAvatar}>{m.name[0].toUpperCase()}</span>
                        <div className={styles.memberInfo}>
                          <span className={styles.memberName}>{m.name}</span>
                          <span className={styles.memberEmail}>{m.email ?? "—"}</span>
                        </div>
                        <span className={styles.memberRole}>{m.role}</span>
                        <span
                          className={styles.memberStatus}
                          style={{
                            color: m.status === "active" ? "#22c55e" : "#f59e0b",
                          }}
                        >
                          {m.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Create / Edit Group Modal ──────────────────────── */}
        {groupModal && (
          <div className={styles.overlay} onClick={() => setGroupModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{groupModal === "create" ? "New Group" : "Edit Group"}</h2>
                <button className={styles.closeBtn} onClick={() => setGroupModal(null)}>✕</button>
              </div>
              <form className={styles.form} onSubmit={handleGroupSave}>
                <div className={styles.field}>
                  <label>Group Name *</label>
                  <input
                    required
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="e.g. Senior Engineers"
                  />
                </div>
                <div className={styles.field}>
                  <label>Privilege Level *</label>
                  <select
                    value={groupForm.privilege_level}
                    onChange={(e) => setGroupForm({ ...groupForm, privilege_level: e.target.value })}
                    disabled={editingGroup?.privilege_level === "MASTER_ADMIN"}
                  >
                    {PRIVILEGE_LEVELS.filter((l) =>
                      // Only allow MASTER_ADMIN if editing an existing MASTER_ADMIN group
                      l !== "MASTER_ADMIN" || editingGroup?.privilege_level === "MASTER_ADMIN"
                    ).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                    {PRIVILEGE_DESCRIPTIONS[groupForm.privilege_level]}
                  </small>
                </div>
                <div className={styles.field}>
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={groupForm.description}
                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    placeholder="Optional description of this group's purpose"
                    style={{ resize: "vertical", minHeight: "60px" }}
                  />
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setGroupModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.saveBtn} disabled={groupSaving}>
                    {groupSaving ? "Saving…" : groupModal === "create" ? "Create Group" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Confirm Delete Group ───────────────────────────── */}
        {confirmDeleteGroup && (
          <div className={styles.overlay} onClick={() => setConfirmDeleteGroup(null)}>
            <div className={styles.modal} style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Delete Group</h2>
                <button className={styles.closeBtn} onClick={() => setConfirmDeleteGroup(null)}>✕</button>
              </div>
              <div className={styles.form}>
                <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>
                  Delete group <strong style={{ color: "#f1f5f9" }}>{confirmDeleteGroup.name}</strong>?
                  This will fail if any users still belong to this group — reassign them first.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDeleteGroup(null)}>Cancel</button>
                  <button className={styles.dangerBtn} onClick={handleDeleteGroup}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Assign User Modal ──────────────────────────────── */}
        {assignModal && (
          <div className={styles.overlay} onClick={() => setAssignModal(false)}>
            <div className={styles.modal} style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Assign User to {selectedGroup?.name}</h2>
                <button className={styles.closeBtn} onClick={() => setAssignModal(false)}>✕</button>
              </div>
              <form className={styles.form} onSubmit={handleAssignUser}>
                <div className={styles.field}>
                  <label>Select User *</label>
                  <select
                    required
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  >
                    <option value="">— Choose a user —</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email ?? u.username ?? "—"})
                        {u.group_name ? ` — currently in ${u.group_name}` : " — no group"}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                    Assigning a user to this group will move them out of their current group.
                  </small>
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setAssignModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.saveBtn} disabled={assignSaving}>
                    {assignSaving ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
