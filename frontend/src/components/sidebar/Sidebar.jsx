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

const COLLAPSED_KEY = "eradesk.sidebarCollapsed";

const Sidebar = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const { statuses, myStatus, setMyStatus, autoUpdate, setAutoUpdate } = useAvailability();

  // ── Collapse state — persisted ───────────────────────────
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "true"
  );

  const toggleCollapse = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSED_KEY, String(!v));
      return !v;
    });
  };

  // Keep CSS variable in sync so content pane adjusts immediately
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "56px" : "260px"
    );
  }, [collapsed]);

  // Set initial value on mount
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "56px" : "260px"
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showPicker, setShowPicker] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  // ── Team management modal ─────────────────────────────────
  const [showTeam, setShowTeam]   = useState(false);
  const [team, setTeam]           = useState([]);
  const [teamError, setTeamError] = useState("");

  const loadTeam = () => getTeam().then(setTeam).catch(() => {});

  useEffect(() => {
    if (showTeam) loadTeam();
  }, [showTeam]);

  const handleRemoveMember = async (id) => {
    setTeamError("");
    try {
      await deleteTeamMember(id);
      await loadTeam();
    } catch (err) {
      setTeamError(err.message);
    }
  };

  // ── Role helpers ──────────────────────────────────────────
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
    { label: "Timesheet",  path: "/timesheet",  icon: "timesheet" },
    ...(effectiveRank >= ROLE_RANK.ADMIN
      ? [{ label: "Analytics", path: "/analytics", icon: "analytics" }]
      : []),
  ];

  const adminViews = [
    ...(effectiveRank >= ROLE_RANK.MANAGER
      ? [{ label: "Users", path: "/users", icon: "users" }]
      : []),
    ...(effectiveRank >= ROLE_RANK.ADMIN
      ? [{ label: "Access & Groups", path: "/access", icon: "access" }]
      : []),
  ];

  const renderNavItem = ({ label, path, icon }) => {
    const isActive = location.pathname === path;
    return (
      <div
        key={path}
        className={`${styles.menuItem} ${isActive ? styles.active : ""} ${collapsed ? styles.menuItemCollapsed : ""}`}
        onClick={() => navigate(path)}
        role="button"
        tabIndex={0}
        aria-current={isActive ? "page" : undefined}
        title={collapsed ? label : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(path);
          }
        }}
      >
        <NavIcon name={icon} className={styles.icon} />
        {!collapsed && <span className={styles.menuLabel}>{label}</span>}
      </div>
    );
  };

  return (
    <>
      <div className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>

        {/* ── Logo / brand ── */}
        <div className={styles.logo}>
          {!collapsed && (
            <div className={styles.logoText}>
              <h2>EraDesk</h2>
              <span>by Erasmith · v1.0</span>
            </div>
          )}
          <div className={`${styles.logoActions} ${collapsed ? styles.logoActionsCollapsed : ""}`}>
            {!collapsed && (
              <div className={styles.bellWrap}>
                <NotificationBell />
              </div>
            )}
            <button
              className={styles.collapseBtn}
              onClick={toggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </div>
        </div>

        {/* Bell shown solo when collapsed */}
        {collapsed && (
          <div className={styles.collapsedBell}>
            <NotificationBell />
          </div>
        )}

        {/* ── Navigation ── */}
        <nav className={styles.navScroll}>
          {!collapsed && (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Core Views</p>
            </div>
          )}
          <div className={`${styles.section} ${collapsed ? styles.sectionCollapsed : ""}`}>
            {collapsed && <div style={{ height: 4 }} />}
            {coreViews.map(renderNavItem)}
          </div>

          {adminViews.length > 0 && (
            <>
              {!collapsed && <div className={styles.sectionDivider} />}
              {!collapsed && (
                <div className={styles.section}>
                  <p className={styles.sectionTitle}>Admin Views</p>
                </div>
              )}
              <div className={`${styles.section} ${collapsed ? styles.sectionCollapsed : ""}`}>
                {adminViews.map(renderNavItem)}
              </div>
            </>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className={`${styles.footer} ${collapsed ? styles.footerCollapsed : ""}`}>
          {!collapsed && user && (
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

          {collapsed ? (
            /* Collapsed footer — stacked icon buttons */
            <div className={styles.collapsedFooterBtns}>
              {user && (
                <button
                  className={styles.iconFooterBtn}
                  title={`${user.name} · ${user.role ?? "MEMBER"} — click to change status`}
                  onClick={() => setShowPicker((v) => !v)}
                  style={{ position: "relative" }}
                >
                  <span className={styles.userAvatar} style={{ width: 28, height: 28, fontSize: 11 }}>
                    {user.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <StatusDot status={myStatus} size="sm" />
                  {showPicker && (
                    <StatusPicker
                      currentStatus={myStatus}
                      onSelect={setMyStatus}
                      autoUpdate={autoUpdate}
                      onToggleAutoUpdate={() => setAutoUpdate(!autoUpdate)}
                      onClose={() => setShowPicker(false)}
                    />
                  )}
                </button>
              )}
              <button
                className={styles.iconFooterBtn}
                title="Team management"
                onClick={() => setShowTeam(true)}
              >⚙</button>
              <button
                className={`${styles.iconFooterBtn} ${styles.iconFooterBtnDanger}`}
                title="Sign out"
                onClick={handleLogout}
              >⏻</button>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* ── Team management modal ── */}
      {showTeam && (
        <div className={styles.modalOverlay} onClick={() => setShowTeam(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Team Management</span>
              <button className={styles.closeBtn} onClick={() => setShowTeam(false)}>✕</button>
            </div>
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
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveMember(m.id)}
                    title="Remove member"
                  >✕</button>
                </div>
              ))}
            </div>
            {teamError && <div className={styles.teamError}>{teamError}</div>}
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
