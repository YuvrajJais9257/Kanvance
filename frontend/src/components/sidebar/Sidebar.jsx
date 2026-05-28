import { useState, useEffect } from "react";
import styles from "./Sidebar.module.css";
import { useNavigate, useLocation } from "react-router-dom";
import { getTeam, deleteTeamMember } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useAvailability } from "../../hooks/useAvailability";
import StatusDot from "../StatusDot/StatusDot";
import StatusPicker from "../StatusDot/StatusPicker";
import NotificationBell from "../Notifications/NotificationBell";
import NavIcon from "./NavIcon";
import EmptyState from "../shared/EmptyState";
// Note: user creation is handled exclusively in User Management (/users)

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

  // ── Team management modal ─────────────────────────────────
  const [showTeam, setShowTeam]   = useState(false);
  const [team, setTeam]           = useState([]);
  const [teamError, setTeamError] = useState("");

  const loadTeam = () =>
    getTeam().then(setTeam).catch(() => {});

  useEffect(() => {
    if (showTeam) loadTeam();
  }, [showTeam]);

  // Remove member (show API error if 409 — open tasks)
  const handleRemoveMember = async (id) => {
    setTeamError("");
    try {
      await deleteTeamMember(id);
      await loadTeam();
    } catch (err) {
      setTeamError(err.message);
    }
  };

  // Effective role = highest of user's own role and their group's privilege_level
  const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };
  const effectiveRole = (() => {
    const userRank  = ROLE_RANK[user?.role]                  ?? 1;
    const groupRank = ROLE_RANK[user?.group_privilege_level] ?? 1;
    return userRank >= groupRank ? (user?.role ?? "MEMBER") : user.group_privilege_level;
  })();
  const effectiveRank = ROLE_RANK[effectiveRole] ?? 1;

  const coreViews = [
    { label: "Dashboard",  path: "/dashboard",  icon: "dashboard" },
    { label: "Projects",   path: "/",           icon: "projects" },
    { label: "Customers",  path: "/customers",  icon: "customers" },
    { label: "My Tasks",   path: "/my-tasks",   icon: "tasks" },
    // Analytics requires effective role >= ADMIN
    ...(effectiveRank >= ROLE_RANK.ADMIN
      ? [{ label: "Analytics", path: "/analytics", icon: "analytics" }]
      : []),
  ];

  const adminViews = [
    // Users and Reports: ADMIN, LEAD, MANAGER (rank >= MANAGER)
    ...(effectiveRank >= ROLE_RANK.MANAGER
      ? [
          { label: "Users",   path: "/users",   icon: "users" },
          { label: "Reports", path: "/reports", icon: "reports" },
        ]
      : []),
    // Access & Groups: ADMIN+ only
    ...(effectiveRank >= ROLE_RANK.ADMIN
      ? [{ label: "Access & Groups", path: "/access", icon: "access" }]
      : []),
  ];

  const renderNavItem = ({ label, path, icon }) => (
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
      <NavIcon name={icon} className={styles.icon} />
      <span className={styles.menuLabel}>{label}</span>
    </div>
  );

  return (
    <>
      <div className={styles.sidebar}>
        <div className={styles.logo}>
          <h2>CYBERARK</h2>
          <span>Practice Tracker v1.0</span>
          <div className={styles.bellWrap}>
            <NotificationBell />
          </div>
        </div>

        <nav className={styles.navScroll}>
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Core Views</p>
            {coreViews.map(renderNavItem)}
          </div>

          {adminViews.length > 0 && (
            <>
              <div className={styles.sectionDivider} />
              <div className={styles.section}>
                <p className={styles.sectionTitle}>Admin Views</p>
                {adminViews.map(renderNavItem)}
              </div>
            </>
          )}
        </nav>

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

      {/* Team management modal */}
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
                <EmptyState icon="👥" message="No team members yet." compact className={styles.emptyTeam} />
              )}
              {team.map((m) => (
                <div key={m.id} className={styles.memberRow}>
                  <span className={styles.memberAvatar}>{m.name[0]}</span>
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>{m.name}</span>
                    {m.email && <span className={styles.memberEmail}>{m.email}</span>}
                  </div>
                  <StatusDot status={statuses.get(m.id) ?? "Offline"} size="sm" />
                  {/* Remove button — blocked if member has open tasks */}
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

            {/* Redirect to User Management for adding new users */}
            {effectiveRank >= ROLE_RANK.MANAGER && (
              <div className={styles.addMemberHint}>
                <p className={styles.addMemberHintText}>
                  To add a new team member, use the{" "}
                  <button
                    className={styles.addMemberLink}
                    onClick={() => { setShowTeam(false); navigate("/users"); }}
                  >
                    User Management
                  </button>{" "}
                  page where you can set up credentials and roles properly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
