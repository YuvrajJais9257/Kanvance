import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import styles from "./Customers.module.css";
import {
  getCustomers, getCustomer, createCustomer, updateCustomer,
  getContacts, createContact, deleteContact,
  getDocuments, createDocument, deleteDocument, uploadDocument,
  getInfra, createInfra, deleteInfra,
} from "../../api";
import { useError } from "../../context/ErrorContext";

const STATUS_COLORS = {
  "On Track":  { bg: "rgba(52,168,83,0.18)",  color: "#58d47a" },
  "At Risk":   { bg: "rgba(245,158,11,0.18)", color: "#f5b24d" },
  "Delayed":   { bg: "rgba(239,68,68,0.16)",  color: "#ff7f7f" },
  "Completed": { bg: "rgba(52,168,83,0.18)",  color: "#58d47a" },
  "On Hold":   { bg: "rgba(148,163,184,0.15)",color: "#94a3b8" },
};

const DRAWER_TABS = ["Profile", "Projects", "Contacts", "Documents", "Infra"];

const blankCustomer = {
  name: "", industry: "", region: "", cyberark_tenant: "",
  idp: "", siem: "", license_type: "", license_count: "", license_expiry: "", notes: "",
};

export default function Customers() {
  const { showError } = useError();
  const location = useLocation();

  // ── List state ──────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);

  // ── Drawer state ────────────────────────────────────────
  const [selected, setSelected]   = useState(null);   // full customer object
  const [activeTab, setActiveTab] = useState("Profile");
  const [contacts, setContacts]   = useState([]);
  const [documents, setDocuments] = useState([]);
  const [infra, setInfra]         = useState([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── Add-customer modal ───────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(blankCustomer);
  const [saving, setSaving]       = useState(false);

  // ── Inline add rows ──────────────────────────────────────
  const [newContact,  setNewContact]  = useState({ name: "", role: "", email: "", phone: "" });
  const [newDocument, setNewDocument] = useState({ name: "", type: "HLD", link: "" });
  const [newInfra,    setNewInfra]    = useState({ hostname: "", role: "PVWA", environment: "Production" });

  // ── File upload state ────────────────────────────────────
  const fileInputRef = useRef(null);
  const [uploadMode,    setUploadMode]    = useState("link"); // "link" | "file"
  const [uploadFile,    setUploadFile]    = useState(null);
  const [uploadDocType, setUploadDocType] = useState("HLD");
  const [uploading,     setUploading]     = useState(false);

  // ── Load customer list ───────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // ── Auto-open drawer when navigated from "View customer profile" ──
  useEffect(() => {
    const openId = location.state?.openCustomerId;
    if (openId && !loading) {
      openDrawer(openId);
      // Clear the state so back-navigation doesn't re-open
      window.history.replaceState({}, "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, loading]);

  // ── Open drawer ──────────────────────────────────────────
  const openDrawer = async (id) => {
    setActiveTab("Profile");
    setDrawerLoading(true);
    setSelected(null);
    try {
      const [cust, ctcts, docs, srv] = await Promise.all([
        getCustomer(id),
        getContacts(id),
        getDocuments(id),
        getInfra(id),
      ]);
      setSelected(cust);
      setContacts(ctcts);
      setDocuments(docs);
      setInfra(srv);
    } catch (err) {
      showError(err.message);
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => { setSelected(null); setEditingProfile(false); };

  // ── F-7: Edit customer profile ───────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm,    setProfileForm]    = useState({});
  const [profileSaving,  setProfileSaving]  = useState(false);

  const startEditProfile = () => {
    setProfileForm({
      industry:        selected.industry        ?? "",
      region:          selected.region          ?? "",
      cyberark_tenant: selected.cyberark_tenant ?? "",
      idp:             selected.idp             ?? "",
      siem:            selected.siem            ?? "",
      license_type:    selected.license_type    ?? "",
      license_count:   selected.license_count   ?? "",
      license_expiry:  selected.license_expiry
        ? selected.license_expiry.split("T")[0]
        : "",
      notes:           selected.notes           ?? "",
    });
    setEditingProfile(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateCustomer(selected.id, {
        ...profileForm,
        license_count: profileForm.license_count !== "" ? Number(profileForm.license_count) : null,
        license_expiry: profileForm.license_expiry || null,
      });
      // Refresh the drawer with updated data
      const updated = await getCustomer(selected.id);
      setSelected(updated);
      setEditingProfile(false);
      // Also refresh the grid card
      await loadList();
    } catch (err) { showError(err.message); }
    finally { setProfileSaving(false); }
  };

  // ── Add customer ─────────────────────────────────────────
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createCustomer(form);
      setShowModal(false);
      setForm(blankCustomer);
      await loadList();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Add contact ──────────────────────────────────────────
  const handleAddContact = async () => {
    if (!newContact.name.trim()) return;
    try {
      await createContact(selected.id, newContact);
      setNewContact({ name: "", role: "", email: "", phone: "" });
      const updated = await getContacts(selected.id);
      setContacts(updated);
    } catch (err) { showError(err.message); }
  };

  const handleDeleteContact = async (id) => {
    try {
      await deleteContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) { showError(err.message); }
  };

  // ── Add document (link mode) ─────────────────────────────
  const handleAddDocument = async () => {
    if (!newDocument.name.trim()) return;
    try {
      await createDocument(selected.id, newDocument);
      setNewDocument({ name: "", type: "HLD", link: "" });
      const updated = await getDocuments(selected.id);
      setDocuments(updated);
    } catch (err) { showError(err.message); }
  };

  // ── Upload document (file mode) ──────────────────────────
  const handleUploadDocument = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("type", uploadDocType);
      // name defaults to filename in the controller if not provided
      await uploadDocument(selected.id, fd);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const updated = await getDocuments(selected.id);
      setDocuments(updated);
    } catch (err) { showError(err.message); }
    finally { setUploading(false); }
  };

  const handleDeleteDocument = async (id) => {
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) { showError(err.message); }
  };

  // ── Add infra server ─────────────────────────────────────
  const handleAddInfra = async () => {
    if (!newInfra.hostname.trim()) return;
    try {
      await createInfra(selected.id, newInfra);
      setNewInfra({ hostname: "", role: "PVWA", environment: "Production" });
      const updated = await getInfra(selected.id);
      setInfra(updated);
    } catch (err) { showError(err.message); }
  };

  const handleDeleteInfra = async (id) => {
    try {
      await deleteInfra(id);
      setInfra((prev) => prev.filter((s) => s.id !== id));
    } catch (err) { showError(err.message); }
  };

  // ── Helpers ──────────────────────────────────────────────
  const f = (val) => val || <span className={styles.empty}>—</span>;

  return (
    <div>
      <Sidebar />
      <div className={styles.page} style={{ marginLeft: "260px" }}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Customers</h1>
            <p className={styles.subtitle}>All organisations you work with</p>
          </div>
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            + Add Customer
          </button>
        </div>

        {/* Customer Grid */}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : customers.length === 0 ? (
          <div className={styles.empty}>No customers yet. Add one to get started.</div>
        ) : (
          <div className={styles.grid}>
            {customers.map((c) => (
              <div key={c.id} className={styles.card} onClick={() => openDrawer(c.id)}>
                <div className={styles.cardHeader}>
                  <div className={styles.customerInitial}>
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className={styles.cardMeta}>
                    <div className={styles.customerName}>{c.name}</div>
                    <div className={styles.industry}>{c.industry || "—"}</div>
                  </div>
                  {c.license_type && (
                    <span className={styles.licenseTag}>{c.license_type}</span>
                  )}
                </div>
                <div className={styles.cardStats}>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{c.license_count ?? "—"}</span>
                    <span className={styles.statLabel}>Licenses</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>
                      {c.license_expiry
                        ? new Date(c.license_expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                    <span className={styles.statLabel}>Expiry</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Drawer ─────────────────────────────────────── */}
        {(selected || drawerLoading) && (
          <div className={styles.overlay} onClick={closeDrawer}>
            <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
              <div className={styles.drawerHeader}>
                <div>
                  <div className={styles.drawerTitle}>
                    {selected ? selected.name : "Loading…"}
                  </div>
                  {selected?.industry && (
                    <div className={styles.drawerSub}>{selected.industry}</div>
                  )}
                </div>
                <button className={styles.closeBtn} onClick={closeDrawer}>✕</button>
              </div>

              {drawerLoading ? (
                <div className={styles.loading}>Loading…</div>
              ) : (
                <div className={styles.drawerBody}>
                  {/* Tabs */}
                  <div className={styles.tabs}>
                    {DRAWER_TABS.map((t) => (
                      <button
                        key={t}
                        className={`${styles.tabBtn} ${activeTab === t ? styles.tabActive : ""}`}
                        onClick={() => setActiveTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* ── Profile tab ── */}
                  {activeTab === "Profile" && (
                    <>
                      {editingProfile ? (
                        /* ── Edit mode ── */
                        <form onSubmit={handleSaveProfile}>
                          <div className={styles.profileGrid}>
                            {[
                              ["industry",        "Industry",        "text",   "e.g. Banking"],
                              ["region",          "Region",          "text",   "e.g. Mumbai"],
                              ["cyberark_tenant", "CyberArk Tenant", "text",   "tenant.cyberark.cloud"],
                              ["idp",             "IdP",             "text",   "e.g. Azure AD"],
                              ["siem",            "SIEM",            "text",   "e.g. Splunk"],
                              ["license_type",    "License Type",    "text",   "e.g. Enterprise"],
                              ["license_count",   "License Count",   "number", "e.g. 500"],
                              ["license_expiry",  "License Expiry",  "date",   ""],
                            ].map(([field, label, type, placeholder]) => (
                              <div key={field} className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>{label}</span>
                                <input
                                  type={type}
                                  className={styles.profileEditInput}
                                  placeholder={placeholder}
                                  value={profileForm[field] ?? ""}
                                  onChange={(e) => setProfileForm({ ...profileForm, [field]: e.target.value })}
                                />
                              </div>
                            ))}
                          </div>
                          <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                            <span className={styles.fieldLabel}>Notes</span>
                            <textarea
                              className={styles.profileEditTextarea}
                              rows={3}
                              placeholder="Any notes about this customer…"
                              value={profileForm.notes}
                              onChange={(e) => setProfileForm({ ...profileForm, notes: e.target.value })}
                            />
                          </div>
                          <div className={styles.profileEditActions}>
                            <button type="button" className={styles.cancelEditBtn}
                              onClick={() => setEditingProfile(false)}>Cancel</button>
                            <button type="submit" className={styles.saveEditBtn} disabled={profileSaving}>
                              {profileSaving ? "Saving…" : "Save Profile"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        /* ── View mode ── */
                        <>
                          <div className={styles.profileGrid}>
                            {[
                              ["Industry",        selected.industry],
                              ["Region",          selected.region],
                              ["CyberArk Tenant", selected.cyberark_tenant],
                              ["IdP",             selected.idp],
                              ["SIEM",            selected.siem],
                              ["License Type",    selected.license_type],
                              ["License Count",   selected.license_count],
                              ["License Expiry",  selected.license_expiry
                                ? new Date(selected.license_expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                : null],
                            ].map(([label, val]) => (
                              <div key={label} className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>{label}</span>
                                <div className={`${styles.fieldValue} ${!val ? styles.empty : ""}`}>
                                  {val ?? "—"}
                                </div>
                              </div>
                            ))}
                          </div>
                          {selected.notes && (
                            <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                              <span className={styles.fieldLabel}>Notes</span>
                              <div className={styles.fieldValue}>{selected.notes}</div>
                            </div>
                          )}
                          <button className={styles.editProfileBtn} onClick={startEditProfile}>
                            ✎ Edit Profile
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {/* ── Projects tab ── */}
                  {activeTab === "Projects" && (
                    <>
                      <p className={styles.sectionTitle}>Projects</p>
                      {selected.projects && selected.projects.length > 0 ? (
                        <div className={styles.itemList}>
                          {selected.projects.map((p) => {
                            const sc = STATUS_COLORS[p.status] ?? { bg: "#1a2030", color: "#94a3b8" };
                            return (
                              <div key={p.id} className={styles.projectItem}>
                                <div className={styles.itemMain}>
                                  <div className={styles.projectName}>{p.name}</div>
                                  <div className={styles.projectMeta}>
                                    {p.type} · {p.owner_name ?? "Unassigned"}
                                  </div>
                                </div>
                                <span
                                  className={styles.statusPill}
                                  style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}44` }}
                                >
                                  {p.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.emptyState}>No projects for this customer yet.</div>
                      )}
                    </>
                  )}

                  {/* ── Contacts tab ── */}
                  {activeTab === "Contacts" && (
                    <>
                      <p className={styles.sectionTitle}>Contacts</p>
                      <div className={styles.itemList}>
                        {contacts.length === 0 && (
                          <div className={styles.emptyState}>No contacts added yet.</div>
                        )}
                        {contacts.map((c) => (
                          <div key={c.id} className={styles.item}>
                            <div className={styles.itemMain}>
                              <div className={styles.itemName}>{c.name}</div>
                              <div className={styles.itemSub}>
                                {[c.role, c.department, c.email, c.phone].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDeleteContact(c.id)}
                              title="Remove contact"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      <div className={styles.addRow}>
                        <input className={styles.addInput} placeholder="Name *"
                          value={newContact.name}
                          onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                        <input className={styles.addInput} placeholder="Role"
                          value={newContact.role}
                          onChange={(e) => setNewContact({ ...newContact, role: e.target.value })} />
                        <input className={styles.addInput} placeholder="Email"
                          value={newContact.email}
                          onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
                        <button className={styles.addConfirmBtn} onClick={handleAddContact}>
                          + Add
                        </button>
                      </div>
                    </>
                  )}

                  {/* ── Documents tab ── */}
                  {activeTab === "Documents" && (
                    <>
                      <p className={styles.sectionTitle}>Documents</p>
                      <div className={styles.itemList}>
                        {documents.length === 0 && (
                          <div className={styles.emptyState}>No documents added yet.</div>
                        )}
                        {documents.map((d) => (
                          <div key={d.id} className={styles.item}>
                            <div className={styles.itemMain}>
                              <div className={styles.itemName}>
                                {d.link ? (
                                  <a href={d.link} target="_blank" rel="noreferrer"
                                    style={{ color: "#5a8cff", textDecoration: "none" }}>
                                    {d.name}
                                  </a>
                                ) : d.name}
                              </div>
                              <div className={styles.itemSub}>
                                {d.type} · {d.status}
                                {d.link && (
                                  <> · <a href={d.link} target="_blank" rel="noreferrer"
                                    style={{ color: "#5a8cff", fontSize: "11px" }}>
                                    {d.link.startsWith("http://localhost") || d.link.startsWith("http://127")
                                      ? "📎 Uploaded file"
                                      : "🔗 Open link"}
                                  </a></>
                                )}
                              </div>
                            </div>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDeleteDocument(d.id)}
                              title="Remove document"
                            >✕</button>
                          </div>
                        ))}
                      </div>

                      {/* ── Mode toggle ── */}
                      <div className={styles.uploadToggle}>
                        <button
                          className={`${styles.toggleBtn} ${uploadMode === "link" ? styles.toggleActive : ""}`}
                          onClick={() => setUploadMode("link")}
                        >🔗 Add Link</button>
                        <button
                          className={`${styles.toggleBtn} ${uploadMode === "file" ? styles.toggleActive : ""}`}
                          onClick={() => setUploadMode("file")}
                        >📁 Upload File</button>
                      </div>

                      {/* ── Link mode ── */}
                      {uploadMode === "link" && (
                        <div className={styles.addRow}>
                          <input className={styles.addInput} placeholder="Document name *"
                            value={newDocument.name}
                            onChange={(e) => setNewDocument({ ...newDocument, name: e.target.value })} />
                          <select className={styles.addInput}
                            value={newDocument.type}
                            onChange={(e) => setNewDocument({ ...newDocument, type: e.target.value })}
                            style={{ flex: "0 0 auto", width: "100px" }}>
                            {["HLD","LLD","SOP","Architecture Diagram","Network Diagram","Infra Sheet","Other"].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                          <input className={styles.addInput} placeholder="Link (optional)"
                            value={newDocument.link}
                            onChange={(e) => setNewDocument({ ...newDocument, link: e.target.value })} />
                          <button className={styles.addConfirmBtn} onClick={handleAddDocument}>
                            + Add
                          </button>
                        </div>
                      )}

                      {/* ── File upload mode ── */}
                      {uploadMode === "file" && (
                        <div className={styles.uploadRow}>
                          <label className={styles.fileLabel}>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.svg,.txt"
                              className={styles.fileInput}
                              onChange={(e) => setUploadFile(e.target.files[0] || null)}
                            />
                            <span className={styles.fileLabelText}>
                              {uploadFile ? `📄 ${uploadFile.name}` : "Choose file…"}
                            </span>
                          </label>
                          <select className={styles.addInput}
                            value={uploadDocType}
                            onChange={(e) => setUploadDocType(e.target.value)}
                            style={{ flex: "0 0 auto", width: "110px" }}>
                            {["HLD","LLD","SOP","Architecture Diagram","Network Diagram","Infra Sheet","Other"].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                          <button
                            className={styles.addConfirmBtn}
                            onClick={handleUploadDocument}
                            disabled={!uploadFile || uploading}
                          >
                            {uploading ? "Uploading…" : "⬆ Upload"}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Infra tab ── */}
                  {activeTab === "Infra" && (
                    <>
                      <p className={styles.sectionTitle}>Infrastructure Servers</p>
                      <div className={styles.itemList}>
                        {infra.length === 0 && (
                          <div className={styles.emptyState}>No servers added yet.</div>
                        )}
                        {infra.map((s) => (
                          <div key={s.id} className={styles.item}>
                            <div className={styles.itemMain}>
                              <div className={styles.itemName}>{s.hostname}</div>
                              <div className={styles.itemSub}>
                                {[s.role, s.environment, s.ip_address, s.os].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDeleteInfra(s.id)}
                              title="Remove server"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      <div className={styles.addRow}>
                        <input className={styles.addInput} placeholder="Hostname *"
                          value={newInfra.hostname}
                          onChange={(e) => setNewInfra({ ...newInfra, hostname: e.target.value })} />
                        <select className={styles.addInput}
                          value={newInfra.role}
                          onChange={(e) => setNewInfra({ ...newInfra, role: e.target.value })}
                          style={{ flex: "0 0 auto", width: "110px" }}>
                          {["PVWA","CPM","PSM","DR Vault","Primary Vault","Jump Server","Other"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <select className={styles.addInput}
                          value={newInfra.environment}
                          onChange={(e) => setNewInfra({ ...newInfra, environment: e.target.value })}
                          style={{ flex: "0 0 auto", width: "120px" }}>
                          {["Production","UAT","Dev","POC"].map((env) => (
                            <option key={env}>{env}</option>
                          ))}
                        </select>
                        <button className={styles.addConfirmBtn} onClick={handleAddInfra}>
                          + Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Add Customer Modal ──────────────────────────── */}
        {showModal && (
          <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>Add Customer</h2>
                <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
              </div>
              <form className={styles.form} onSubmit={handleAddCustomer}>
                <div className={styles.field}>
                  <label>Company Name *</label>
                  <input required placeholder="e.g. HDFC Bank"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Industry</label>
                    <input placeholder="e.g. Banking"
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label>Region</label>
                    <input placeholder="e.g. India"
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })} />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>License Type</label>
                    <input placeholder="e.g. Enterprise"
                      value={form.license_type}
                      onChange={(e) => setForm({ ...form, license_type: e.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label>License Count</label>
                    <input type="number" placeholder="e.g. 500"
                      value={form.license_count}
                      onChange={(e) => setForm({ ...form, license_count: e.target.value })} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>License Expiry</label>
                  <input type="date"
                    value={form.license_expiry}
                    onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} />
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn}
                    onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? "Saving…" : "Add Customer"}
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
