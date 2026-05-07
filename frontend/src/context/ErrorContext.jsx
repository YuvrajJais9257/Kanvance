import { createContext, useContext, useState, useCallback, useRef } from "react";

const ErrorContext = createContext(null);

export function ErrorProvider({ children }) {
  const [message, setMessage] = useState(null);
  // F-6 fix: use useRef for the timer to avoid stale closure in useCallback
  const timerRef = useRef(null);

  const showError = useCallback((msg) => {
    setMessage(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 4000);
  }, []); // no dependencies needed — ref is stable

  const dismiss = useCallback(() => {
    setMessage(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <ErrorContext.Provider value={{ showError }}>
      {children}
      {message && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%",
          transform: "translateX(-50%)",
          background: "#1f2937", color: "#f87171",
          border: "1px solid #ef444466",
          padding: "12px 20px", borderRadius: "8px",
          fontSize: "14px", zIndex: 9999,
          display: "flex", alignItems: "center", gap: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          maxWidth: "480px",
        }}>
          <span>⚠ {message}</span>
          <button onClick={dismiss} style={{
            background: "none", border: "none", color: "#9ca3af",
            cursor: "pointer", fontSize: "16px", lineHeight: 1,
          }}>✕</button>
        </div>
      )}
    </ErrorContext.Provider>
  );
}

export const useError = () => {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useError must be used inside ErrorProvider");
  return ctx;
};
