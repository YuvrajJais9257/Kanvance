import { useState, useEffect, useCallback } from "react";
import styles from "./Dashboard.module.css";
import Sidebar from "../sidebar/Sidebar";
import DeadlineBanner from "../Notifications/DeadlineBanner";
import { getDashboard, getProjects, createProject, getCustomers, getTeam } from "../../api";
import { useError } from "../../context/ErrorContext";
import { useAvailability } from "../../hooks/useAvailability";
import StatusDot from "../StatusDot/StatusDot";

const TYPE_COLORS = {
  Implementation:   "#3b82f6",
  "Managed Service": "#2dd4bf",
  "License Renewal": "#fb923c",
  "New Opportunity": "#a78bfa",
};

const STATUS_COLORS = {
  "On Track":   "#4ade80",
  "At Risk":    "#facc15",
  Delayed:      "#f87171",
  Completed:    "#4ade80",
  Prospecting:  "#60a5fa",
};

const todayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric",
}).format(new Date());

export default function Dashboard() {
  const { showError } = useError();
  const { statuses } = useAvailability();

  const [summary, setSummary]     = useState(null);
  const [projects, setProjects]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [team, setTeam]           = useState([]);
  const [loading, setLoading]     = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    customer_id: "", type: "Implementation", owner_id: "",
    status: "On Track", due_date: "", name: "", subtitle: "",
  });
  const [saving, setSaving] = useState(false);

  // F-4 fix: wrap load in useCallback so it's stable across renders
  const load = useCallback(async () => {
    try {
      const [s, p, c, t] = await Promise.all([
        getDashboard(), getProjects(), getCustomers(), getTeam(),
      ]);
      setSummary(s);
      setProjects(p);
      setCustomers(c);
      setTeam(t);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createProject({
        ...form,
        customer_id: Number(form.customer_id),
        owner_id: form.owner_id ? Number(form.owner_id) : null,
      });
      setShowModal(false);
      setForm({ customer_id: "", type: "Implementation", owner_id: "", status: "On Track", due_date: "", name: "", subtitle: "" });
      await load();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const statCards = summary
    ? [
        { label: "TOTAL PROJECTS",    value: summary.total_projects,                          sub: `${customers.length} customers`,  color: "#4a9eff" },
        { label: "IMPLEMENTATIONS",   value: summary.by_type["Implementation"]   ?? 0,        sub: "Active deployments",             color: "#3b82f6" },
        { label: "MANAGED SERVICES",  value: summary.by_type["Managed Service"]  ?? 0,        sub: "Operations",                     color: "#4ade80" },
        { label: "LICENSE RENEWALS",  value: summary.by_type["License Renewal"]  ?? 0,        sub: "Pending renewal",                color: "#facc15" },
        { label: "OPPORTUNITIES",     value: summary.by_type["New Opportunity"]  ?? 0,        sub: "Presales / POC",                 color: "#fb923c" },
      ]
    : [];

  return (
    <div>
      <Sidebar />
      <div className={styles.dashboard}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>Overview of all projects</p>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.dateStr}>{todayLabel}</span>
            <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ Add Project</button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <>
            {/* Critical deadline banner — overdue/today only, dismissible per session */}
            <DeadlineBanner />

            {/* Stat Cards */}
            <div className={styles.statsRow}>
              {statCards.map((card) => (
                <div key={card.label} className={styles.statCard}>
                  <span className={styles.statLabel}>{card.label}</span>
                  <span className={styles.statValue} style={{ color: card.color }}>{card.value}</span>
                  <span className={styles.statSub}>{card.sub}</span>
                </div>
              ))}
            </div>

            {/* Attention + Due */}
            <div className={styles.midRow}>
              <div className={styles.attentionCard}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>NEEDS ATTENTION</span>
                  <span className={styles.badge} style={{ background: "#ef4444" }}>
                    {summary?.needs_attention?.length ?? 0}
                  </span>
                </div>
                <div className={styles.attentionList}>
                  {(summary?.needs_attention ?? []).map((item) => {
                    const sc = STATUS_COLORS[item.status] ?? "#9ca3af";
                    return (
                      <div key={item.id} className={styles.attentionRow}>
                        <div>
                          <div className={styles.attentionName}>{item.customer_name}</div>
                          <div className={styles.attentionMeta}>
                            {item.type} · {item.owner_name ?? "Unassigned"}
                            {item.blocked_count > 0 && (
                              <span className={styles.blockedBadge}>{item.blocked_count} blocked</span>
                            )}
                          </div>
                        </div>
                        <span
                          className={styles.statusBadge}
                          style={{ background: sc + "22", color: sc, border: `1px solid ${sc}55` }}
                        >
                          {item.status}
                        </span>
                      </div>
                    );
                  })}
                  {(summary?.needs_attention ?? []).length === 0 && (
                    <div className={styles.emptyDue}>All projects on track</div>
                  )}
                </div>
              </div>

              <div className={styles.dueCard}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>DUE IN 30 DAYS</span>
                  <span className={styles.badge} style={{ background: "#374151" }}>
                    {summary?.due_in_30_days?.length ?? 0}
                  </span>
                </div>
                {(summary?.due_in_30_days ?? []).length === 0 ? (
                  <div className={styles.emptyDue}>No upcoming deadlines</div>
                ) : (
                  <div className={styles.attentionList}>
                    {summary.due_in_30_days.map((item) => (
                      <div key={item.id} className={styles.attentionRow}>
                        <div>
                          <div className={styles.attentionName}>{item.customer_name}</div>
                          <div className={styles.attentionMeta}>{item.type}</div>
                        </div>
                        <span className={styles.dueDate}>{item.due_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* All Projects Table */}
            <div className={styles.tableCard}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>ALL PROJECTS</span>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>CUSTOMER</th><th>TYPE</th><th>OWNER</th>
                    <th>PROGRESS</th><th>STATUS</th><th>DUE</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const tc = TYPE_COLORS[p.type]   ?? "#9ca3af";
                    const sc = STATUS_COLORS[p.status] ?? "#9ca3af";
                    const progress = p.progress ?? 0;
                    return (
                      <tr key={p.id} className={styles.tableRow}>
                        <td className={styles.customerName}>{p.customer_name}</td>
                        <td>
                          <span className={styles.typeBadge}
                            style={{ background: tc + "22", color: tc, border: `1px solid ${tc}44` }}>
                            {p.type}
                          </span>
                        </td>
                        <td className={styles.ownerCell}>
                          {p.owner_id ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <StatusDot status={statuses.get(p.owner_id) ?? "Offline"} size="sm" />
                              {p.owner_name}
                            </span>
                          ) : "—"}
                        </td>
                        <td>
                          <div className={styles.progressWrap}>
                            <div className={styles.progressBar}>
                              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                            </div>
                            <span className={styles.progressPct}>{progress}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.statusBadge}
                            style={{ background: sc + "22", color: sc, border: `1px solid ${sc}44` }}>
                            {p.status}
                          </span>
                        </td>
                        <td className={styles.dueCell}>{p.due_date ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Add Project Modal */}
        {showModal && (
          <div className={styles.overlay} onClick={() => setShowModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span>Add New Project</span>
                <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
              </div>
              <form onSubmit={handleAdd} className={styles.modalForm}>
                <label>Customer
                  <select required value={form.customer_id}
                    onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">Select customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>Project name
                  <input value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. HDFC Bank Implementation" />
                </label>
                <label>Subtitle
                  <input value={form.subtitle}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    placeholder="e.g. Phase 2 – PAM vault config" />
                </label>
                <label>Type
                  <select value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option>Implementation</option>
                    <option>Managed Service</option>
                    <option>License Renewal</option>
                    <option>New Opportunity</option>
                  </select>
                </label>
                <label>Owner
                  <select value={form.owner_id}
                    onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                <label>Due Date
                  <input type="date" value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </label>
                <label>Status
                  <select value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option>On Track</option>
                    <option>At Risk</option>
                    <option>Delayed</option>
                    <option>Completed</option>
                    <option>Prospecting</option>
                  </select>
                </label>
                <button type="submit" className={styles.addBtn} disabled={saving}>
                  {saving ? "Saving…" : "Add Project"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
