const express      = require("express");
const cors         = require("cors");
const session      = require("express-session");
const rateLimit    = require("express-rate-limit");
const path         = require("path");
const fs           = require("fs");
require("dotenv").config();

const pool            = require("./src/config/db");
const errorMiddleware = require("./src/middlewares/error.middleware");
const requireAuth     = require("./src/middlewares/requireAuth");

const app = express();

const isProd = process.env.NODE_ENV === "production";

// Required for Render/Railway/Heroku — Express sits behind a reverse proxy.
// Without this, req.secure is always false and secure cookies are never set.
if (isProd) {
  app.set("trust proxy", 1);
}

// S-6: Fail fast if SESSION_SECRET is not set in production
if (isProd && !process.env.SESSION_SECRET) {
  console.error("❌  SESSION_SECRET environment variable must be set in production");
  process.exit(1);
}

/* ── CORS ────────────────────────────────────────────────────── */
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Support comma-separated list of allowed origins
const allowedOrigins = FRONTEND_URL.split(",").map((o) => o.trim());

// Matches any Vercel preview deployment for this project, e.g.:
// kanvance-7o4nk4qq7-yuvraj-jaiswals-projects.vercel.app
const VERCEL_PREVIEW_RE = /^https:\/\/kanvance-.*-yuvraj-jaiswals-projects\.vercel\.app$/;

function isOriginAllowed(origin) {
  if (!origin) return true; // curl, Postman, server-to-server
  if (allowedOrigins.includes(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (isOriginAllowed(origin)) return callback(null, true);
    // Return false (not an Error) — Express will send 403, not 500
    return callback(null, false);
  },
  credentials: true,
}));

// Respond to ALL OPTIONS preflight requests immediately with 204.
// Must come AFTER cors() so the CORS headers are already set,
// and BEFORE requireAuth so preflight is never blocked by auth.
// Express 5 requires "/{*path}" instead of "*" for catch-all routes.
app.options("/{*path}", cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json());

/* ── S-2: Rate limiting on auth endpoints ────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});

/* ── Session ─────────────────────────────────────────────────── */
app.use(session({
  name:   "cyberark.sid",
  secret: process.env.SESSION_SECRET || "dev_secret_change_in_production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // In production (cross-origin Vercel ↔ Render):
    //   secure: true  — cookie only sent over HTTPS
    //   sameSite: "none" — required for cross-site cookies (Vercel → Render)
    // In development (same-origin localhost):
    //   secure: false, sameSite: "lax"
    secure:   isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

/* ── DB health check ─────────────────────────────────────────── */
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log("✅  MySQL connected");
    conn.release();
  } catch (err) {
    console.error("❌  DB connection error:", err.message);
  }
})();

/* ── Public routes ───────────────────────────────────────────── */
app.get("/", (req, res) => res.send("CyberArk Practice Tracker API"));

// Apply rate limiter to auth routes (S-2)
app.use("/api/auth", authLimiter, require("./src/routers/auth.routes"));

/* ── Dev-only migration endpoint ─────────────────────────────── */
if (!isProd) {
  app.post("/api/migrate", async (req, res, next) => {
    try {
      const results = [];

      // Migration 1: add password_hash column to users if missing
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'`,
        [process.env.DB_NAME]
      );
      if (cols.length === 0) {
        await pool.execute(
          `ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL`
        );
        results.push("added password_hash to users");
      }

      // Migration 2: create user_groups table if missing
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS user_groups (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          name            VARCHAR(100) NOT NULL UNIQUE,
          privilege_level ENUM('MASTER_ADMIN','ADMIN','MANAGER','MEMBER') NOT NULL DEFAULT 'MEMBER',
          description     TEXT DEFAULT NULL,
          created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      results.push("ensured user_groups table exists");

      // Migration 3: add group_id column to users if missing
      const [groupCol] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'group_id'`,
        [process.env.DB_NAME]
      );
      if (groupCol.length === 0) {
        await pool.execute(
          `ALTER TABLE users ADD COLUMN group_id INT DEFAULT NULL,
           ADD CONSTRAINT fk_users_group FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE SET NULL`
        );
        results.push("added group_id to users");
      }

      // Migration 4: seed a default MASTER_ADMIN group if none exists
      const [[{ cnt }]] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM user_groups WHERE privilege_level = 'MASTER_ADMIN'"
      );
      if (cnt === 0) {
        await pool.execute(
          `INSERT INTO user_groups (name, privilege_level, description)
           VALUES ('Master Admins', 'MASTER_ADMIN', 'Full system access — cannot be deleted')`
        );
        results.push("seeded Master Admins group");
      }

      // Migration 5: seed a default Members group if none exists
      const [[{ cnt: memberCnt }]] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM user_groups WHERE privilege_level = 'MEMBER'"
      );
      if (memberCnt === 0) {
        await pool.execute(
          `INSERT INTO user_groups (name, privilege_level, description)
           VALUES ('Members', 'MEMBER', 'Default group for new users — read-only access')`
        );
        results.push("seeded Members group");
      }

      res.json({ migrated: true, results });
    } catch (err) { next(err); }
  });
}

/* ── Auth guard — all routes below require a valid session ───── */
app.use("/api", requireAuth);

/* ── S-3: Protected file serving (auth required) ─────────────── */
// Replaces the old express.static("/uploads") which was publicly accessible.
app.get("/uploads/:customerId/:filename", requireAuth, (req, res) => {
  const { customerId, filename } = req.params;
  // Sanitize: only allow safe characters to prevent path traversal
  if (!/^\d+$/.test(customerId) || !/^[\w\-. ]+$/.test(filename)) {
    return res.status(400).json({ error: "Invalid path" });
  }
  const filePath = path.join(__dirname, "uploads", customerId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  res.sendFile(filePath);
});

/* ── Protected routes ────────────────────────────────────────── */
app.use("/api/users",        require("./src/routers/user.routes"));
app.use("/api/user-groups",  require("./src/routers/userGroup.routes"));
app.use("/api/team",         require("./src/routers/team.routes"));
app.use("/api/customers",    require("./src/routers/customer.routes"));
app.use("/api/projects",   require("./src/routers/project.routes"));
app.use("/api/groups",     require("./src/routers/group.routes"));
app.use("/api/subtasks",   require("./src/routers/subtask.routes"));
app.use("/api/contacts",   require("./src/routers/contact.routes"));
app.use("/api/documents",  require("./src/routers/document.routes"));
app.use("/api/infra",      require("./src/routers/infra.routes"));
app.use("/api/dashboard",  require("./src/routers/dashboard.routes"));
app.use("/api/my-tasks",     require("./src/routers/myTasks.routes"));
app.use("/api/availability",    require("./src/routers/availability.routes"));
app.use("/api/timesheet",       require("./src/routers/timesheet.routes"));
app.use("/api/analytics",       require("./src/routers/analytics.routes"));
app.use("/api/activity-logs",   require("./src/routers/activityLog.routes"));
app.use("/api/reports",         require("./src/routers/reports.routes"));
app.use("/api/notifications",   require("./src/routers/notifications.routes"));
app.use("/api/admin",           require("./src/routers/delete.routes"));

/* ── Dev-only seed endpoint ──────────────────────────────────── */
if (!isProd) {
  app.post("/api/seed", requireAuth, async (req, res, next) => {
    try {
      const sql = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));
      for (const stmt of statements) {
        await pool.execute(stmt);
      }
      res.json({ seeded: true });
    } catch (err) { next(err); }
  });
}

/* ── Global error handler ────────────────────────────────────── */
app.use(errorMiddleware);

/* ── Start ───────────────────────────────────────────────────── */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀  Server on port ${PORT}`);

  // ── Deadline notification cron job ────────────────────────
  // Runs every day at 09:00 AM server time
  const cron = require("node-cron");
  const { generateDailyNotifications } = require("./src/services/deadlineNotification.service");

  cron.schedule("0 9 * * *", async () => {
    console.log("⏰  Running daily deadline notification job...");
    try {
      const result = await generateDailyNotifications();
      console.log(`✅  Deadline notifications: ${result.notificationsCreated} created, ${result.notificationsSkipped} skipped`);
    } catch (err) {
      console.error("❌  Deadline notification job failed:", err.message);
    }
  }, {
    timezone: "Asia/Kolkata" // IST — adjust to your server timezone
  });

  console.log("⏰  Deadline notification cron scheduled (daily 09:00 AM IST)");
});
