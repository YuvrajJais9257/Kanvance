// ─────────────────────────────────────────────────────────────
// api.js  —  All backend calls in one place
// Flip USE_API to false to fall back to in-memory stubs while
// the backend is not yet running (G6 adapter pattern).
// ─────────────────────────────────────────────────────────────

const USE_API = true;
const BASE    = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ── Generic fetch helper ─────────────────────────────────────
async function request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",   // send HTTP-only cookie on every request
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const get    = (path)        => request("GET",    path);
const post   = (path, body)  => request("POST",   path, body);
const put    = (path, body)  => request("PUT",    path, body);
const del    = (path, body)  => request("DELETE", path, body);

// ── Team ─────────────────────────────────────────────────────
export const getTeam         = ()       => USE_API ? get("/api/team")          : Promise.resolve([]);
export const createTeamMember = (data)  => USE_API ? post("/api/team", data)   : Promise.resolve({ id: Date.now() });
export const deleteTeamMember = (id)    => USE_API ? del(`/api/team/${id}`)    : Promise.resolve();

// ── Customers ────────────────────────────────────────────────
export const getCustomers    = ()       => USE_API ? get("/api/customers")              : Promise.resolve([]);
export const getCustomer     = (id)     => USE_API ? get(`/api/customers/${id}`)        : Promise.resolve(null);
export const createCustomer  = (data)   => USE_API ? post("/api/customers", data)       : Promise.resolve({ id: Date.now() });
export const updateCustomer  = (id, d)  => USE_API ? put(`/api/customers/${id}`, d)     : Promise.resolve();

// ── Projects ─────────────────────────────────────────────────
export const getProjects     = ()       => USE_API ? get("/api/projects")               : Promise.resolve([]);
export const getProject      = (id)     => USE_API ? get(`/api/projects/${id}`)         : Promise.resolve(null);
export const createProject   = (data)   => USE_API ? post("/api/projects", data)        : Promise.resolve({ id: Date.now() });
export const updateProject   = (id, d)  => USE_API ? put(`/api/projects/${id}`, d)      : Promise.resolve();
export const deleteProject   = (id)     => USE_API ? del(`/api/projects/${id}`)         : Promise.resolve();

// ── Activity Groups ──────────────────────────────────────────
export const createGroup     = (pid, d) => USE_API ? post(`/api/projects/${pid}/groups`, d) : Promise.resolve({ id: Date.now() });
export const updateGroup     = (id, d)  => USE_API ? put(`/api/groups/${id}`, d)             : Promise.resolve();
export const deleteGroup     = (id)     => USE_API ? del(`/api/groups/${id}`)                : Promise.resolve();

// ── Subtasks ─────────────────────────────────────────────────
export const createSubtask   = (gid, d) => USE_API ? post(`/api/groups/${gid}/subtasks`, d) : Promise.resolve({ id: Date.now() });
export const updateSubtask   = (id, d)  => USE_API ? put(`/api/subtasks/${id}`, d)           : Promise.resolve();
export const deleteSubtask   = (id)     => USE_API ? del(`/api/subtasks/${id}`)               : Promise.resolve();

// ── Contacts ─────────────────────────────────────────────────
export const getContacts     = (cid)    => USE_API ? get(`/api/customers/${cid}/contacts`)    : Promise.resolve([]);
export const createContact   = (cid, d) => USE_API ? post(`/api/customers/${cid}/contacts`, d): Promise.resolve({ id: Date.now() });
export const deleteContact   = (id)     => USE_API ? del(`/api/contacts/${id}`)               : Promise.resolve();

// ── Documents ────────────────────────────────────────────────
export const getDocuments    = (cid)    => USE_API ? get(`/api/customers/${cid}/documents`)    : Promise.resolve([]);
export const createDocument  = (cid, d) => USE_API ? post(`/api/customers/${cid}/documents`, d): Promise.resolve({ id: Date.now() });
export const deleteDocument  = (id)     => USE_API ? del(`/api/documents/${id}`)               : Promise.resolve();
export const getEntityDocs   = (type, id) => USE_API ? get(`/api/documents/entity/${type}/${id}`) : Promise.resolve([]);
export const getPickerDocs   = (cid)    => USE_API ? get(`/api/documents/picker/${cid}`)       : Promise.resolve([]);
export const linkDocument    = (data)   => USE_API ? post("/api/documents/link", data)         : Promise.resolve();
export const unlinkDocument  = (data)   => USE_API ? post("/api/documents/unlink", data)       : Promise.resolve();

// File upload — sends multipart/form-data (NOT JSON)
export const uploadDocument = (customerId, formData) => {
  if (!USE_API) return Promise.resolve({ id: Date.now() });
  return fetch(`${BASE}/api/customers/${customerId}/documents/upload`, {
    method: "POST",
    credentials: "include",
    body: formData,   // FormData — browser sets Content-Type with boundary automatically
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });
};

// ── Infra Servers ────────────────────────────────────────────
export const getInfra        = (cid)    => USE_API ? get(`/api/customers/${cid}/infra`)        : Promise.resolve([]);
export const createInfra     = (cid, d) => USE_API ? post(`/api/customers/${cid}/infra`, d)    : Promise.resolve({ id: Date.now() });
export const deleteInfra     = (id)     => USE_API ? del(`/api/infra/${id}`)                   : Promise.resolve();
export const getEntityInfra  = (type, id) => USE_API ? get(`/api/infra/entity/${type}/${id}`)  : Promise.resolve([]);
export const getPickerInfra  = (cid)    => USE_API ? get(`/api/infra/picker/${cid}`)           : Promise.resolve([]);
export const linkInfra       = (data)   => USE_API ? post("/api/infra/link", data)             : Promise.resolve();
export const unlinkInfra     = (data)   => USE_API ? post("/api/infra/unlink", data)           : Promise.resolve();

// ── Dashboard ────────────────────────────────────────────────
export const getDashboard    = ()       => USE_API ? get("/api/dashboard")                     : Promise.resolve({
  total_projects: 0,
  by_type: {},
  needs_attention: [],
  due_in_30_days: [],
});

// ── My Tasks ─────────────────────────────────────────────────
export const getMyTasks = (memberId) =>
  USE_API ? get(`/api/my-tasks?member_id=${memberId}`) : Promise.resolve([]);

// ── Auth ──────────────────────────────────────────────────────
export const login    = (data) => post("/api/auth/login",    data);
export const logout   = ()     => post("/api/auth/logout");
export const me       = ()     => get("/api/auth/me");
export const register = (data) => post("/api/auth/register", data);

// ── Availability ─────────────────────────────────────────────
export const getAvailability  = ()       => USE_API ? get("/api/availability")              : Promise.resolve([]);
export const updateMyStatus   = (status) => USE_API ? put("/api/availability", { status })  : Promise.resolve();

// ── User Management (admin) ───────────────────────────────────
export const getUsers      = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null))
  ).toString();
  return USE_API ? get(`/api/users${qs ? "?" + qs : ""}`) : Promise.resolve({ data: [], total: 0, page: 1, limit: 50 });
};
export const getUserById   = (id)     => USE_API ? get(`/api/users/${id}`)          : Promise.resolve(null);
export const createUser    = (data)   => USE_API ? post("/api/users", data)          : Promise.resolve({ id: Date.now() });
export const updateUser    = (id, d)  => USE_API ? request("PATCH", `/api/users/${id}`, d) : Promise.resolve();
export const deactivateUser = (id)   => USE_API ? request("PATCH", `/api/users/${id}/deactivate`) : Promise.resolve();
export const deleteUser    = (id)     => USE_API ? del(`/api/users/${id}`)           : Promise.resolve();
