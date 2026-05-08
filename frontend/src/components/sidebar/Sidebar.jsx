import { useState, useEffect } from "react";
import styles from "./Sidebar.module.css";
import { useNavigate, useLocation } from "react-router-dom";
import { getTeam, createTeamMember, deleteTeamMember } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useAvailability } from "../../hooks/useAvailability";
import StatusDot from "../StatusDot/StatusDot";
import StatusPicker from "../StatusDot/StatusPicker";

const Sidebar = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const { statuses, myStatus, setMyStatus, autoUpdate, setAutoUpdate } = useAvailability();

  const [showPicker, setShowPicker] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  // ── Team management modal (F3.13–F3.17) ─────────────────
  const [showTeam, setShowTeam]   = useState(false);
  const [team, setTeam]           = useState([]);
  const [newName, setNewName]     = useState("");
  const [newEmail, setNewEmail]   = useState("");
  const [teamError, setTeamError] = useState("");
  const [adding, setAdding]       = useState(false);

  const loadTeam = () =>
    getTeam().then(setTeam).catch(() => {});

  useEffect(() => {
    if (showTeam) loadTeam();
  }, [showTeam]);

  // F3.15 — add member
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setTeamError("");
    try {
      await createTeamMember({ name: newName.trim(), email: newEmail.trim() || null });
      setNewName("");
      setNewEmail("");
      await loadTeam();
    } catch (err) {
      setTeamError(err.message);
    } finally {
      setAdding(false);
    }
  };

  // F3.16 — remove member (show API error if 409)
  const handleRemoveMember = async (id) => {
    setTeamError("");
    try {
      await deleteTeamMember(id);
      await loadTeam();
    } catch (err) {
      setTeamError(err.message);
    }
  };

  const navItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Projects",  path: "/" },
    { label: "Customers", path: "/customers" },
    { label: "My Tasks",  path: "/my-tasks" },
    // Users page — visible to ADMIN and MANAGER only
    ...( ["ADMIN","MANAGER"].includes(user?.role) ? [{ label: "Users", path: "/users" }] : [] ),
  ];

  return (
    <>
      <div className={styles.sidebar}>
        <div className={styles.logo}>
          <h2>CYBERARK</h2>
          <span>Practice Tracker v1.0</span>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>VIEWS</p>
          {navItems.map(({ label, path }) => (
            <div
              key={path}
              className={`${styles.menuItem} ${location.pathname === path ? styles.active : ""}`}
              onClick={() => navigate(path)}
              role="button"
              tabIndex={0}
              aria-current={location.pathname === path ? "page" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(path);
                }
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Footer — user info + logout + team management */}
        <div className={styles.footer}>
          {user && (
            <div
              className={styles.userRow}
              style={{ position: "relative", cursor: "pointer" }}
              onClick={() => setShowPicker((v) => !v)}
              title="Click to change your status"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowPicker((v) => !v);
                }
              }}
            >
              <span className={styles.userAvatar}>{user.name?.[0]?.toUpperCase() ?? "?"}</span>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{user.role ?? "MEMBER"}</span>
              </div>
              <StatusDot status={myStatus} size="md" />
              {showPicker && (
                <StatusPicker
                  currentStatus={myStatus}
                  onSelect={setMyStatus}
                  autoUpdate={autoUpdate}
                  onToggleAutoUpdate={() => setAutoUpdate(!autoUpdate)}
                  onClose={() => setShowPicker(false)}
                />
              )}
            </div>
          )}
          <div className={styles.footerBtns}>
            <button
              className={styles.gearBtn}
              title="Team management"
              onClick={() => setShowTeam(true)}
            >
              ⚙ Team
            </button>
            <button
              className={styles.logoutBtn}
              title="Sign out"
              onClick={handleLogout}
            >
              ⏻ Logout
            </button>
          </div>
        </div>
      </div>

      {/* F3.14 — Team management modal */}
      {showTeam && (
        <div className={styles.modalOverlay} onClick={() => setShowTeam(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Team Management</span>
              <button className={styles.closeBtn} onClick={() => setShowTeam(false)}>✕</button>
            </div>

            {/* Current members */}
            <div className={styles.memberList}>
              {team.length === 0 && (
                <div className={styles.emptyTeam}>No team members yet.</div>
              )}
              {team.map((m) => (
                <div key={m.id} className={styles.memberRow}>
                  <span className={styles.memberAvatar}>{m.name[0]}</span>
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>{m.name}</span>
                    {m.email && <span className={styles.memberEmail}>{m.email}</span>}
                  </div>
                  <StatusDot status={statuses.get(m.id) ?? "Offline"} size="sm" />
                  {/* F3.16 — remove button */}
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveMember(m.id)}
                    title="Remove member"
                  >✕</button>
                </div>
              ))}
            </div>

            {/* Error message (e.g. 409 open tasks) */}
            {teamError && (
              <div className={styles.teamError}>{teamError}</div>
            )}

            {/* F3.15 — add member form */}
            <form className={styles.addForm} onSubmit={handleAddMember}>
              <input
                className={styles.addInput}
                placeholder="Name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
              <input
                className={styles.addInput}
                placeholder="Email (optional)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <button type="submit" className={styles.addBtn} disabled={adding}>
                {adding ? "Adding…" : "+ Add Member"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
