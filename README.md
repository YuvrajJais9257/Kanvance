<div align="center">

<img src="EraDesk.png" width="320" alt="EraDesk" />

# EraDesk

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)

**Work. Track. Deliver.**

A full-stack internal project management platform built for [Erasmith Technologies](https://erasmith.com) —  
one tool for projects, customers, tasks, timesheets, infrastructure, and analytics across the entire organisation.

</div>

---

## About Erasmith

Erasmith has been in the digital transformation space for over 9 years, serving more than 100 customers across geographies with over 90% repeat business. With an 80+ member team, more than 20% senior tech enablers, 100+ certifications, and a Great Place to Work certification — twice — Erasmith needed a platform built to its own standard. EraDesk is that platform.

---

## ✨ Features

### Dashboard & Projects

- 📊 **Live Dashboard** — Stat cards for total projects by type (Implementations, Managed Services, License Renewals, New Opportunities), a Needs Attention panel for At Risk / Delayed / Blocked projects, a 30-day deadline view, and a dismissible critical deadline banner for overdue items
- 🎯 **Project Pipeline** — Full project list with auto-generated task templates on creation per project type. Project health (On Track → At Risk → Delayed → Completed) is derived automatically from subtask states and deadlines — never manually updated
- 🗂️ **Project Detail View** — Full task tree (activity groups → subtasks), actual vs. estimated hours with variance, unassigned subtask warnings, and manual statuses (Prospecting, On Hold) that are never auto-overridden

### Customer Management

- 👥 **Customer Profiles** — Name, industry, CyberArk tenant, region, IDP, SIEM, license type, count, and expiry
- 📇 **Contacts** — Contact people linked to each customer
- 📄 **Document Hub** — Upload and link HLDs, LLDs, SOPs, and Architecture Diagrams polymorphically to any customer, project, activity group, or subtask
- 🖥️ **Infrastructure Registry** — Track server inventory (PVWA, CPM, PSM, Vault, Jump Servers) per customer, linkable to projects, groups, and subtasks
- 🔗 **Linked Projects** — All projects under a customer visible from the customer profile

### Task Management

- ✅ **6-Stage Subtask Workflows** — Not Started → In Progress → In Testing → Awaiting Feedback → Blocked → Done
- 👤 **Multi-Assignee Support** — Assign single or multiple users per subtask with full assignment history (Manager+)
- 🔗 **Effective Assignee Resolution** — Direct assignment → task-level inherited → project owner inherited
- 🚩 **Flag & Escalation System** — Flag blocked tasks with type, reason, and waiting-on field for instant visibility across the team
- 📅 **Due Dates** — Per-subtask due dates with drag-to-reorder (position tracking)
- 🗂️ **My Tasks** — Personal task queue filtered to the logged-in user; managers can view any member's queue via `?member_id=`

### Timesheet & Hours

- ⏱️ **Weekly Timesheet Grid** — Log hours per subtask per day (Mon–Sun navigation) with time type: Billable, Non-billable, Overtime, Holidays, Sick Time, Training, Vacation
- 👁️ **Team Grid View** — Managers can view the full team's logged hours for any week
- 📤 **Excel Upload Pipeline** — 4-step workflow:
  1. Download pre-formatted `.xlsx` template
  2. Upload and parse the filled template
  3. Preview enriched rows — 🟢 new (will insert), 🟡 conflicting (will overwrite, shows existing hours and source), 🔴 rejected (permission violation or unresolvable employee, with per-row reason)
  4. Confirm and save, or download the enriched Excel
- ✅ **Post-Import Summary** — Imported X rows — Y new, Z updated, W rejected
- 🔒 **Role-Scoped Uploads** — Members upload only for themselves; Admins and Managers upload for anyone

### Analytics (Admin only)

Four tabs:

- **Overview** — KPI cards (total projects, completed, at risk, delayed, total tasks, completion rate %, blocked count, total hours logged) + subtask status breakdown bar chart + 30-day activity sparkline
- **Projects** — Completion rates table: customer, project, type, status, progress bar, done/total subtasks, blocked count, due date
- **Team** — Team utilisation cards showing hours breakdown (working, billable, overtime, leave) and utilisation % per person, with an expandable drill-down into every project → task group → subtask with logged hours. Hours per person per project table with distribution bars
- **Blocked Tasks** — All blocked and awaiting-feedback tasks with flag type, reason, waiting-on field, and assignee

### Access, Roles & Security

- 🔐 **5-Level Role Hierarchy** — MASTER_ADMIN → ADMIN → MANAGER → LEAD → MEMBER
- 👥 **Group-Based Privilege Elevation** — User groups elevate effective role beyond base role (e.g., a MEMBER in an ADMIN group gets admin-level access)
- 👤 **User Management** — Create, edit, deactivate, and soft-delete users with protection (must reassign open tasks before deletion). Role changes immediately invalidate active sessions
- 🔑 **Access & Groups** — Create and manage user groups with privilege levels; assign and remove group members
- 🟢 **Real-Time Availability** — Online / Away / Busy / Offline status with optional auto-update on activity; live status dots across team views
- 🔔 **Notifications** — Deadline alerts surfaced to the right people, with unread badge, critical banner on dashboard, and mark-all-read
- 🛡️ **Secure Auth** — Session cookies (`httpOnly`, `secure`, `sameSite: strict`), bcrypt, rate limiting (20 req / 15 min per IP), `role_version` invalidation on permission changes, path traversal protection on all file serving routes

---

## 🗺️ Application Routes

| Route | Page | Access |
|---|---|---|
| `/login` | Login | Public |
| `/dashboard` | Dashboard | All authenticated users |
| `/` | Projects | All authenticated users |
| `/customers` | Customers | All authenticated users |
| `/my-tasks` | My Tasks | All authenticated users |
| `/timesheet` | Weekly Timesheet | All authenticated users |
| `/notifications` | Notifications | All authenticated users |
| `/users` | User Management | Manager+ |
| `/access` | Access & Groups | Admin+ |
| `/analytics` | Analytics KPI Dashboard | Admin+ |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8+

### 1. Clone & Install

```bash
git clone https://github.com/erasmith/eradesk.git
cd eradesk

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

**`backend/.env`**

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=project_management
SESSION_SECRET=your_secret_here
FRONTEND_URL=http://localhost:5173
PORT=4000
USE_TIMESHEET_ENTRIES_AS_SOURCE=true
```

**`frontend/.env`**

```env
VITE_API_URL=http://localhost:4000
```

### 3. Database Setup

```bash
# Run all migrations in order — each is idempotent and safe to re-run
node backend/src/migrations/001_analytics_timesheet_refactor.js
node backend/src/migrations/002_assignment_membership_architecture.js
node backend/src/migrations/003_timesheet_entries_refactor.js
node backend/src/migrations/004_fix_task_assignments_unique_key.js
```

Each migration script supports `--dry-run` to preview SQL without writing to the database.

### 4. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Redux Toolkit, React Router 7 |
| **Backend** | Node.js, Express 5, express-session |
| **Database** | MySQL 8 (mysql2) |
| **Auth** | bcrypt, session cookies, rate limiting (express-rate-limit) |
| **File Uploads** | Multer (auth-protected serving, no public static access) |
| **Excel Pipeline** | ExcelJS (template generation, parse, conflict preview, export) |
| **Dev Tools** | Nodemon, ESLint |

---

## 📁 Project Structure

```
eradesk/
├── backend/
│   ├── src/
│   │   ├── config/         # DB pool
│   │   ├── controllers/    # Route handlers
│   │   ├── middlewares/    # Auth, error handling, uploads, role guards
│   │   ├── migrations/     # Idempotent DDL migrations (run in order)
│   │   ├── models/         # DB query layer
│   │   ├── routers/        # Express route definitions
│   │   └── services/       # Business logic
│   │       ├── assignment.service.js   # Multi-assignee sync, bulk assign, distribute
│   │       ├── subtask.service.js      # Subtask updates, auto-hour logging on Done
│   │       └── timesheet.service.js   # Excel pipeline, conflict preview, commit
│   └── server.js           # Express entry point
└── frontend/
    └── src/
        ├── components/
        │   ├── Analytics/      # KPI dashboard — 4 tabs
        │   ├── Customers/      # Customer profiles, contacts, infra, docs
        │   ├── Dashboard/      # Summary stats, deadline views
        │   ├── Login/          # Split-panel login page
        │   ├── MyTasks/        # Personal task queue
        │   ├── Notifications/  # Deadline alerts
        │   ├── Projects/       # Project pipeline, task tree, multi-assign
        │   ├── Reports/        # Excel upload pipeline UI
        │   ├── shared/         # Reusable components (PageSkeleton, Pagination, etc.)
        │   ├── sidebar/        # Navigation, availability, team management
        │   ├── Timesheet/      # Weekly grid timesheet
        │   └── Users/          # User management, Access & Groups
        ├── context/            # Auth & Error providers
        ├── hooks/              # useAvailability, useClientPagination
        ├── redux/              # Store + view slice
        └── api.js              # Centralised API client
```

---

## 🗄️ Database Schema

| Table | Purpose |
|---|---|
| `users` | Platform users with roles, status, availability, group membership, and `role_version` |
| `user_groups` | Access control tiers with privilege levels |
| `customers` | Client organisations with tenant, IDP, SIEM, and license details |
| `projects` | Belong to a customer and owner; status auto-derived from subtasks |
| `project_members` | Explicit project membership for assignment and access control |
| `activity_groups` | Phase / stage groups within a project |
| `subtasks` | Individual work items; drives project health and timesheet grid |
| `task_assignments` | Multi-assignee history per subtask with soft-delete (`unassigned_date`) |
| `subtask_log` | Audit trail for subtask field changes |
| `timesheet_entries` | Hours per user per subtask per day with `time_type` |
| `time_logs` | Legacy hours ledger (app auto-log + Excel import) |
| `timesheet_upload_runs` | Audit trail for Excel upload batches |
| `documents` | Files and links per customer |
| `document_links` | Polymorphic join: document ↔ project / group / subtask |
| `infra_servers` | Server inventory per customer |
| `infra_links` | Polymorphic join: server ↔ project / group / subtask |
| `notifications` | Deadline alerts per user with read state |
| `availability` | Per-user online status |

---

## 🗺️ Migrations

All migrations are idempotent Node.js scripts. Run them in order on a fresh database or to bring an existing schema up to date.

| File | What it does |
|---|---|
| `001_analytics_timesheet_refactor.js` | Adds `estimated_hours` columns; creates `task_assignments` and `timesheet_entries` tables |
| `002_assignment_membership_architecture.js` | Creates `project_members`; adds `assignee_id` to `activity_groups`; adds `unassigned_date` and `inherited_from_task_id` to `task_assignments` |
| `003_timesheet_entries_refactor.js` | Drops `billable_hours`; adds `time_type` ENUM to `timesheet_entries` |
| `004_fix_task_assignments_unique_key.js` | Replaces narrow `(user_id, subtask_id)` unique key with `(user_id, subtask_id, unassigned_date)` to support soft-delete re-assignment |

---

## 🔒 Security

- Session cookies: `httpOnly`, `secure` in production, `sameSite: strict`
- Auth endpoints rate-limited: 20 requests / 15 min per IP
- File uploads served through authenticated endpoint — no public static access
- Path traversal protection on all file serving routes
- `SESSION_SECRET` required in production (server exits if missing)
- RBAC enforced at route middleware and controller/model level
- `role_version` invalidation — active sessions are kicked when a user's role changes
- Assignment permission gate — Members can only assign or upload for themselves; mismatched rows are rejected per-row with a clear reason, never silently dropped

---

<div align="center">

Built with ❤️ by [Erasmith Technologies](https://erasmith.com)

</div>