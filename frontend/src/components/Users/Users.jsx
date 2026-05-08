import { useState, useEffect, useCallback } from "react";
import Sidebar from "../sidebar/Sidebar";
import styles from "./Users.module.css";
import { getUsers, createUser, updateUser, deactivateUser, deleteUser } from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAuth } from "../../context/AuthContext";

const ROLES    = ["ADMIN", "MANAGER", "MEMBER"];
const STATUSES = ["active", "inactive", "disabled"];

const STATUS_COLORS = {
  active:   { bg: "rgba(34,197,94,0.12)",  color: "#22c55e" },
  inactive: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  disabled: { bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
};

const ROLE_COLORS = {
  ADMIN:   { bg: "rgba(167,139,250,0.12)", color: "#a78bfa" },
  MANAGER: { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6" },
  MEMBER:  { bg: "rgba(100,116,139,0.12)", color: "#64748b" },
};

const blankForm = {
  name: "", username: "", full_name: "", email: "",
  password: "", role: "MEMBER", status: "active",
};

export default function Users() {
  const { showError } = useError();
  const { user: me }  = useAuth();

  const isAdmin   = me?.role === "ADMIN";
  const isManager = me?.role === "MANAGER";

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
      role:      u.role      ?? "MEMBER",
      status:    u.status    ?? "active",
    });
    setEditing(u);
    setModal("edit");
  };

  // ── Save (create or update) ──────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "create") {
        await createUser(form);
      } else {
        const patch = { ...form };
        if (!patch.password) delete patch.password; // don't send empty password
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
      <div className={styles.page} style={{ marginLeft: "260px" }}>

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
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className={styles.select} value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
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
                    <th>Status</th>
                    <th>Last Login</th>
                    {(isAdmin || isManager) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7} className={styles.empty}>No users found.</td></tr>
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
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            )}
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
                      <label>Role</label>
                      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label>Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
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
                  This is a soft delete — the account will be hidden but data is preserved.
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
