import { useState, useEffect, useCallback } from "react";
import Sidebar from "../sidebar/Sidebar";
import PageSkeleton from "../shared/PageSkeleton";
import EmptyState from "../shared/EmptyState";
import Pagination from "../shared/Pagination";
import styles from "./Users.module.css";
import { getUsers, createUser, updateUser, deactivateUser, deleteUser, getUserGroups, assignUserToGroup } from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";

const STATUSES = ["active", "inactive", "disabled"];

const STATUS_COLORS = {
  active:   { bg: "rgba(34,197,94,0.12)",  color: "#22c55e" },
  inactive: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  disabled: { bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
};

const ROLE_COLORS = {
  ADMIN:        { bg: "rgba(167,139,250,0.12)", color: "#a78bfa" },
  MASTER_ADMIN: { bg: "rgba(239,68,68,0.12)",   color: "#ef4444" },
  MANAGER:      { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6" },
  MEMBER:       { bg: "rgba(100,116,139,0.12)", color: "#64748b" },
};

const blankForm = {
  name: "", username: "", full_name: "", email: "",
  password: "", status: "active", group_id: "",
};

export default function Users() {
  const { showError } = useError();
  const { user: me }  = useAuth();

  // Use effective role (highest of user's own role and their group's privilege_level)
  const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };
  const effectiveRoleRank = Math.max(
    ROLE_RANK[me?.role]                  ?? 1,
    ROLE_RANK[me?.group_privilege_level] ?? 1
  );
  const isAdmin   = effectiveRoleRank >= ROLE_RANK.ADMIN;
  const isManager = effectiveRoleRank >= ROLE_RANK.MANAGER;

  // ── List state ──────────────────────────────────────────────
  const [users,   setUsers]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(true);

  // ── Filters ─────────────────────────────────────────────────
  const [search,       setSearch]       = useState("");
  const [filterRole,   setFilterRole]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // ── Modal state ─────────────────────────────────────────────
  const [modal,   setModal]   = useState(null); // null | "create" | "edit"
  const [editing, setEditing] = useState(null); // user object being edited
  const [form,    setForm]    = useState(blankForm);
  const [saving,  setSaving]  = useState(false);

  // ── Confirm delete ──────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ── Groups ──────────────────────────────────────────────────
  const [groups, setGroups] = useState([]);

  const LIMIT = 20;

  // ── Load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsers({ page, limit: LIMIT, search, role: filterRole, status: filterStatus });
      setUsers(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterRole, filterStatus]);

  useEffect(() => { load(); }, [load]);

  // Load groups for the group picker
  useEffect(() => {
    if (isAdmin) {
      getUserGroups().then(setGroups).catch(() => {});
    }
  }, [isAdmin]);

  // ── Open create modal ────────────────────────────────────────
  const openCreate = () => {
    setForm(blankForm);
    setEditing(null);
    setModal("create");
  };

  // ── Open edit modal ──────────────────────────────────────────
  const openEdit = (u) => {
    setForm({
      name:      u.name      ?? "",
      username:  u.username  ?? "",
      full_name: u.full_name ?? "",
      email:     u.email     ?? "",
      password:  "",
      status:    u.status    ?? "active",
      group_id:  u.group_id  ?? "",
    });
    setEditing(u);
    setModal("edit");
  };

  // ── Save (create or update) ──────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (modal === "create" && !form.group_id) {
      showError("Please select a group for this user.");
      return;
    }
    setSaving(true);
    try {
      if (modal === "create") {
        // role is derived from group on the backend — don't send it
        await createUser(form);
      } else {
        const patch = { ...form };
        if (!patch.password) delete patch.password; // don't send empty password
        delete patch.role;     // role is controlled by group, not editable directly
        // Handle group change via assign endpoint (also syncs role on backend)
        if (patch.group_id && patch.group_id !== editing.group_id) {
          await assignUserToGroup(patch.group_id, editing.id);
        }
        delete patch.group_id; // group is managed separately
        await updateUser(editing.id, patch);
      }
      setModal(null);
      await load();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Deactivate ───────────────────────────────────────────────
  const handleDeactivate = async (u) => {
    try {
      await deactivateUser(u.id);
      await load();
    } catch (err) { showError(err.message); }
  };

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteUser(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (err) { showError(err.message); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <Sidebar />
      <div className={`${styles.page} app-page-scroll`}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>User Management</h1>
            <p className={styles.subtitle}>{total} user{total !== 1 ? "s" : ""} in the system</p>
          </div>
          {isAdmin && (
            <button className={styles.addBtn} onClick={openCreate}>+ Add User</button>
          )}
        </div>

        {/* Filters */}
        <div className={styles.filterRow}>
          <input
            className={styles.searchInput}
            placeholder="Search name, username, email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select className={styles.select} value={filterRole}
            onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="MASTER_ADMIN">Master Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="MEMBER">Member</option>
          </select>
          <select className={styles.select} value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <PageSkeleton variant="table" rows={8} />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    {(isAdmin || isManager) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin || isManager ? 8 : 7}>
                        <EmptyState icon="👤" title="No users found" message="Try adjusting your search or filters." compact />
                      </td>
                    </tr>
                  )}
                  {users.map((u) => {
                    const sc = STATUS_COLORS[u.status] ?? STATUS_COLORS.active;
                    const rc = ROLE_COLORS[u.role]     ?? ROLE_COLORS.MEMBER;
                    const loginDate = u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : "—";
                    return (
                      <tr key={u.id} className={styles.row}>
                        <td>
                          <div className={styles.nameCell}>
                            <span className={styles.avatar}>{u.name[0].toUpperCase()}</span>
                            <div>
                              <div className={styles.userName}>{u.name}</div>
                              {u.full_name && <div className={styles.fullName}>{u.full_name}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={styles.mono}>{u.username ?? "—"}</td>
                        <td className={styles.email}>{u.email ?? "—"}</td>
                        <td>
                          <span className={styles.badge} style={{ background: rc.bg, color: rc.color }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={styles.badge} style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}>
                            {u.group_name ?? "—"}
                          </span>
                        </td>
                        <td>
                          <span className={styles.badge} style={{ background: sc.bg, color: sc.color }}>
                            {u.status}
                          </span>
                        </td>
                        <td className={styles.date}>{loginDate}</td>
                        {(isAdmin || isManager) && (
                          <td>
                            <div className={styles.actions}>
                              <button className={styles.editBtn} onClick={() => openEdit(u)}>Edit</button>
                              {isAdmin && u.status === "active" && u.id !== me?.id && (
                                <button className={styles.warnBtn} onClick={() => handleDeactivate(u)}>Deactivate</button>
                              )}
                              {isAdmin && u.id !== me?.id && (
                                <button className={styles.dangerBtn} onClick={() => setConfirmDelete(u)}>Delete</button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={LIMIT}
              onPageChange={setPage}
            />
          </>
        )}

        {/* ── Create / Edit Modal ─────────────────────────────── */}
        {modal && (
          <div className={styles.overlay} onClick={() => setModal(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{modal === "create" ? "Add User" : "Edit User"}</h2>
                <button className={styles.closeBtn} onClick={() => setModal(null)}>✕</button>
              </div>
              <form className={styles.form} onSubmit={handleSave}>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Display Name *</label>
                    <input required value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Rahul Sharma" />
                  </div>
                  <div className={styles.field}>
                    <label>Username</label>
                    <input value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="e.g. rahul_sharma" />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Full Name</label>
                  <input value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="e.g. Rahul Kumar Sharma" />
                </div>
                <div className={styles.field}>
                  <label>Email *</label>
                  <input required type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="rahul@company.com" />
                </div>
                <div className={styles.field}>
                  <label>{modal === "create" ? "Password *" : "New Password (leave blank to keep)"}</label>
                  <input type="password" value={form.password}
                    required={modal === "create"}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 8 chars, letter + number" />
                </div>
                {isAdmin && (
                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <div className={styles.field}>
                    <label>Group {modal === "create" ? "*" : ""}</label>
                    <select
                      value={form.group_id}
                      required={modal === "create"}
                      onChange={(e) => setForm({ ...form, group_id: e.target.value ? Number(e.target.value) : "" })}
                    >
                      <option value="">— Select a group —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.privilege_level})
                        </option>
                      ))}
                    </select>
                    {/* Show the access level the selected group will grant */}
                    {form.group_id && (() => {
                      const selectedGroup = groups.find((g) => g.id === Number(form.group_id));
                      const level = selectedGroup?.privilege_level;
                      const c = ROLE_COLORS[level] ?? ROLE_COLORS.MEMBER;
                      return (
                        <small style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>Access level:</span>
                          <span style={{ background: c.bg, color: c.color, padding: "1px 8px", borderRadius: "4px", fontWeight: 600, fontSize: "11px" }}>
                            {level}
                          </span>
                        </small>
                      );
                    })()}
                    {modal === "create" && !form.group_id && (
                      <small style={{ color: "#64748b", marginTop: "4px", display: "block" }}>
                        Every user must belong to a group. The group determines their access level.
                      </small>
                    )}
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? "Saving…" : modal === "create" ? "Create User" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Confirm Delete ──────────────────────────────────── */}
        {confirmDelete && (
          <div className={styles.overlay} onClick={() => setConfirmDelete(null)}>
            <div className={styles.modal} style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Delete User</h2>
                <button className={styles.closeBtn} onClick={() => setConfirmDelete(null)}>✕</button>
              </div>
              <div className={styles.form}>
                <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>
                  Delete <strong style={{ color: "#f1f5f9" }}>{confirmDelete.name}</strong>?
                  This will remove them from the system and all team lists. Any open tasks assigned to them will be unassigned.
                  Their data is preserved (soft delete).
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className={styles.dangerBtn} onClick={handleDelete}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
