import { createContext, useContext, useState, useCallback, useRef } from "react";
import toastStyles from "./ErrorToast.module.css";

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
        <div className={toastStyles.toast} role="alert">
          <span className={toastStyles.icon} aria-hidden>⚠</span>
          <span className={toastStyles.message}>{message}</span>
          <button type="button" className={toastStyles.dismiss} onClick={dismiss} aria-label="Dismiss">
            ✕
          </button>
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
