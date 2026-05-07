<div align="center">

# 🛡️ CyberArk Practice Tracker

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)

**A full-stack project management portal built specifically for CyberArk implementation teams.**  
Track customers, projects, tasks, infrastructure, and team availability — all in one place.

<img src="Screenshots/Dashboard.png" width="900" alt="CyberArk Practice Tracker Dashboard">

</div>

---

## ✨ Features

- 🎯 **Project Pipeline** — Manage Implementations, Managed Services, License Renewals, and New Opportunities with real-time progress tracking
- 👥 **Customer Management** — Full customer profiles with contacts, infrastructure inventory, and document library
- ✅ **Task Assignment** — Granular subtask tracking with statuses: Not Started → In Progress → In Testing → Awaiting Feedback → Blocked → Done
- 🚩 **Flag & Escalation System** — Flag blocked tasks with reason, waiting-on, and flag type for instant visibility
- 📄 **Document Hub** — Upload and link HLDs, LLDs, SOPs, Architecture Diagrams, and more to any project or task
- 🖥️ **Infrastructure Registry** — Track PVWA, CPM, PSM, Vault, and Jump Server details per customer environment
- 📊 **Live Dashboard** — At-a-glance stats, "Needs Attention" alerts, and 30-day deadline view
- 🟢 **Team Availability** — Real-time online/offline status indicators for all team members
- 🔐 **Secure Auth** — JWT + session-based auth with bcrypt, rate limiting, and protected file serving
- 🗂️ **My Tasks View** — Personal task queue filtered to the logged-in user

---

## 📸 Screenshots

### Dashboard Overview
<img src="Screenshots/Dashboard.png" width="800" alt="Dashboard">

### Project Management
<img src="Screenshots/Projects.png" width="800" alt="Projects">

### Task Tracking & Assignment
| Task Assignment | Flag a Subtask | Task Statuses |
|---|---|---|
| <img src="Screenshots/TaskAssignment.png" width="260" alt="Task Assignment"> | <img src="Screenshots/FlagSubtask.png" width="260" alt="Flag Subtask"> | <img src="Screenshots/Statuses.png" width="260" alt="Statuses"> |

### Customer & Infrastructure
| Customer List | Customer Profile | Add Infrastructure |
|---|---|---|
| <img src="Screenshots/Customers.png" width="260" alt="Customers"> | <img src="Screenshots/CustomerProfile.png" width="260" alt="Customer Profile"> | <img src="Screenshots/AddInfrastrucutre.png" width="260" alt="Add Infrastructure"> |

### Documents & Context
| Document Upload | Attach Context |
|---|---|
| <img src="Screenshots/DocumentUpload.png" width="390" alt="Document Upload"> | <img src="Screenshots/AttachContext.png" width="390" alt="Attach Context"> |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8+

### 1. Clone & Install

```bash
git clone https://github.com/your-username/cyberark-practice-tracker.git
cd cyberark-practice-tracker

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment

**Backend** — create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cyberark
SESSION_SECRET=your_secret_here
FRONTEND_URL=http://localhost:5173
PORT=4000
```

**Frontend** — create `frontend/.env`:

```env
VITE_API_URL=http://localhost:4000
```

### 3. Set Up the Database

```bash
# Create the schema
mysql -u root -p cyberark < backend/schema.sql

# (Optional) Seed sample data
mysql -u root -p cyberark < backend/seed.sql
```

### 4. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Redux Toolkit, React Router 7 |
| **Backend** | Node.js, Express 5, express-session, JWT |
| **Database** | MySQL 8 (mysql2) |
| **Auth** | bcrypt, JWT, rate limiting (express-rate-limit) |
| **File Uploads** | Multer (auth-protected serving) |
| **Dev Tools** | Nodemon, ESLint |

---

## 📁 Project Structure

```
├── backend/
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── models/         # DB query layer
│   │   ├── routers/        # Express route definitions
│   │   ├── services/       # Business logic
│   │   ├── middlewares/    # Auth, error handling, uploads
│   │   └── config/         # DB pool, upload config
│   ├── schema.sql          # Full DB schema
│   └── server.js           # Express app entry point
└── frontend/
    └── src/
        ├── components/     # Dashboard, Projects, Customers, MyTasks
        ├── context/        # Auth & Error context providers
        ├── hooks/          # useAvailability
        ├── redux/          # Store + view slice
        └── api.js          # Centralised API client
```

---

## 🔒 Security Highlights

- Session cookies are `httpOnly`, `secure` (in production), and `sameSite: strict`
- Auth endpoints are rate-limited (20 requests / 15 min per IP)
- File uploads are served through an authenticated endpoint — no public static access
- Path traversal protection on file serving routes
- `SESSION_SECRET` is required in production (app exits if missing)

---

## 🤝 Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

---

<div align="center">

⭐ **Star this repo if it's useful to you!** It helps others find it.

</div>
