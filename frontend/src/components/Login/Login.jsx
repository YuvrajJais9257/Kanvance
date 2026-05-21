import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
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
      {/* Branding Side */}
      <div className={styles.brandingSide}>
        <div className={styles.brandingContent}>
          <div className={styles.brandingLogo}>CYBERARK</div>
          <div className={styles.brandingTagline}>Practice Tracker v1.0</div>
          
          <div className={styles.brandingFeatures}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>&#x1F4CA;</div>
              <div className={styles.featureText}>
                <h4>Project Tracking</h4>
                <p>Monitor implementations, renewals, and opportunities in one place</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>&#x1F465;</div>
              <div className={styles.featureText}>
                <h4>Team Collaboration</h4>
                <p>Assign tasks, track progress, and manage team availability</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>&#x1F4C8;</div>
              <div className={styles.featureText}>
                <h4>Analytics Dashboard</h4>
                <p>Get insights into performance, utilization, and deadlines</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className={styles.formSide}>
        <div className={styles.card}>
          {/* Logo (mobile only) */}
          <div className={styles.logo}>
            <span className={styles.logoText}>CYBERARK</span>
            <span className={styles.logoSub}>Practice Tracker</span>
          </div>

          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Enter your credentials to continue</p>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label>Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
