import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Login.module.css";

function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className={styles.spinner} xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

// Feature list shown on the left panel
const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Manage Projects",
    desc: "Plan, organize and track projects with complete visibility.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Collaborate Better",
    desc: "Assign tasks, share updates and stay aligned as a team.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    title: "Log Time & Stay on Track",
    desc: "Track time, manage timesheets and deliver on commitments.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    title: "Insights & Analytics",
    desc: "Real-time dashboards and reports to make smarter decisions.",
  },
];

export default function Login() {
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Subtle animated background */}
      <div className={styles.bgShapes} aria-hidden>
        <span className={styles.shape1} />
        <span className={styles.shape2} />
        <span className={styles.shape3} />
      </div>

      <div className={styles.layout}>
        {/* ── Left brand panel ── */}
        <aside className={styles.brandPanel}>
          <div className={styles.brandInner}>
            {/* Logo */}
            <div className={styles.logoBlock}>
              <img
                src="/EraDesk.png"
                alt="EraDesk"
                className={styles.logoImg}
                draggable="false"
              />
              <p className={styles.tagline}>Work. Track. Deliver.</p>
            </div>

            {/* One-liner */}
            <p className={styles.brandDesc}>
              A complete project management solution for your team.
            </p>

            {/* Feature list */}
            <ul className={styles.featureList} role="list">
              {FEATURES.map((f) => (
                <li key={f.title} className={styles.featureItem}>
                  <span className={styles.featureIcon} aria-hidden="true">{f.icon}</span>
                  <div>
                    <span className={styles.featureTitle}>{f.title}</span>
                    <span className={styles.featureDesc}>{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <p className={styles.poweredBy}>
            Powered by{" "}
            <a
              href="https://erasmith.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.poweredByLink}
            >
              Erasmith Technologies
            </a>
          </p>
        </aside>

        {/* ── Right form panel ── */}
        <main className={styles.formPanel}>
          <div className={styles.card}>
            <h1 className={styles.title}>Welcome back!</h1>
            <p className={styles.subtitle}>Sign in to continue to EraDesk</p>

            {error && (
              <div className={styles.errorBanner} role="alert">
                {error}
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              {/* Email */}
              <div className={styles.field}>
                <label htmlFor="login-email">Email address</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className={styles.field}>
                <label htmlFor="login-password">Password</label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className={styles.optionsRow}>
                <label className={styles.rememberLabel}>
                  <input type="checkbox" className={styles.rememberCheck} />
                  <span>Remember me</span>
                </label>
                <a href="/forgot-password" className={styles.forgotLink}>
                  Forgot password?
                </a>
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? (
                  <><Spinner /> Signing in…</>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
