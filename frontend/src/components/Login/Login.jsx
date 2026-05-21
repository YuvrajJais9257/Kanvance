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

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);

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
      <div className={styles.bgShapes} aria-hidden>
        <span className={styles.shape1} />
        <span className={styles.shape2} />
        <span className={styles.shape3} />
      </div>

      <div className={styles.layout}>
        <aside className={styles.brandPanel}>
          <div className={styles.brandInner}>
            <span className={styles.logoText}>CYBERARK</span>
            <span className={styles.logoSub}>Practice Tracker</span>
            <p className={styles.tagline}>
              Enterprise project visibility for implementations, managed services, and renewals.
            </p>

            {/* Stats strip */}
            <div className={styles.statsStrip} aria-label="Platform statistics">
              <div className={styles.statItem}>
                <span className={styles.statValue}>19</span>
                <span className={styles.statLabel}>Projects tracked</span>
              </div>
              <div className={styles.statDivider} aria-hidden />
              <div className={styles.statItem}>
                <span className={styles.statValue}>6</span>
                <span className={styles.statLabel}>Team members</span>
              </div>
              <div className={styles.statDivider} aria-hidden />
              <div className={styles.statItem}>
                <span className={styles.statValue}>100%</span>
                <span className={styles.statLabel}>Visibility</span>
              </div>
            </div>

            {/* Mini dashboard preview */}
            <div className={styles.dashPreview} aria-hidden>
              <div className={styles.dashBar}>
                <span className={styles.dashBarLabel}>Implementations</span>
                <div className={styles.dashBarTrack}>
                  <div className={styles.dashBarFill} style={{ width: "72%" }} />
                </div>
                <span className={styles.dashBarPct}>72%</span>
              </div>
              <div className={styles.dashBar}>
                <span className={styles.dashBarLabel}>Managed Services</span>
                <div className={styles.dashBarTrack}>
                  <div className={styles.dashBarFill} style={{ width: "55%" }} />
                </div>
                <span className={styles.dashBarPct}>55%</span>
              </div>
              <div className={styles.dashBar}>
                <span className={styles.dashBarLabel}>Renewals</span>
                <div className={styles.dashBarTrack}>
                  <div className={styles.dashBarFill} style={{ width: "88%" }} />
                </div>
                <span className={styles.dashBarPct}>88%</span>
              </div>
              <div className={styles.dashStatusRow}>
                {["Done", "In Progress", "Blocked", "Not Started"].map((s) => (
                  <span key={s} className={`${styles.dashChip} ${styles["dashChip_" + s.replace(/ /g, "")]}`}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className={styles.socialProof}>Trusted by security practice teams worldwide</p>
        </aside>

        <main className={styles.formPanel}>
          <div className={styles.card}>
            <h1 className={styles.title}>Sign in</h1>
            <p className={styles.subtitle}>Enter your credentials to continue</p>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="login-password">Password</label>
                <div className={styles.passwordWrap}>
                  <input
                    id="login-password"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    tabIndex={0}
                  >
                    <EyeIcon open={showPass} />
                  </button>
                </div>
              </div>

              <div className={styles.forgotRow}>
                <a href="/forgot-password" className={styles.forgotLink}>
                  Forgot password?
                </a>
              </div>

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? (
                  <>
                    <Spinner />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
