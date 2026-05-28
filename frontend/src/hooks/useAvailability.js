import { useState, useEffect, useRef, useCallback } from "react";
import { getAvailability, updateMyStatus } from "../api";
import { useAuth } from "../context/AuthContext";

const POLL_INTERVAL_MS  = 60_000;   // 60 seconds
const IDLE_TIMEOUT_MS   = 10 * 60 * 1000; // 10 minutes
const THROTTLE_MS       = 1_000;    // activity events fire at most once per second
const LS_KEY            = "cyberark.autoUpdate";

/**
 * useAvailability
 *
 * Returns:
 *   statuses     — Map<number, string>  userId → status string
 *   myStatus     — string               own current status
 *   setMyStatus  — async (status) => void  optimistic update + API call
 *   autoUpdate   — boolean              current auto-update preference
 *   setAutoUpdate — (bool) => void      persists to localStorage
 */
export function useAvailability() {
  const { user } = useAuth();

  const [statuses, setStatuses]       = useState(new Map());
  const [myStatus, setMyStatusLocal]  = useState("Offline");
  const [autoUpdate, setAutoUpdateState] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Refs so callbacks always see the latest values without re-registering effects
  const myStatusRef    = useRef(myStatus);
  const autoUpdateRef  = useRef(autoUpdate);
  const userRef        = useRef(user);
  const idleTimerRef   = useRef(null);
  const wasAutoAway    = useRef(false);
  const lastThrottle   = useRef(0);
  const intervalRef    = useRef(null);

  useEffect(() => { myStatusRef.current    = myStatus;    }, [myStatus]);
  useEffect(() => { autoUpdateRef.current  = autoUpdate;  }, [autoUpdate]);
  useEffect(() => { userRef.current        = user;        }, [user]);

  // ── Fetch all statuses ──────────────────────────────────────
  const fetchStatuses = useCallback(async () => {
    try {
      const data = await getAvailability();
      const map  = new Map();
      for (const u of data) {
        map.set(Number(u.id), u.status);
      }
      setStatuses(map);
      if (userRef.current) {
        const own = map.get(Number(userRef.current.id)) ?? "Offline";
        setMyStatusLocal(own);
      }
    } catch (err) {
      console.error("[useAvailability] poll error:", err);
    }
  }, []);

  // ── Optimistic status update ────────────────────────────────
  const setMyStatus = useCallback(async (status) => {
    if (!userRef.current) return;
    const uid = Number(userRef.current.id);

    // Optimistic update
    const prev = myStatusRef.current;
    setMyStatusLocal(status);
    setStatuses((m) => {
      const next = new Map(m);
      next.set(uid, status);
      return next;
    });

    try {
      await updateMyStatus(status);
    } catch (err) {
      console.error("[useAvailability] setMyStatus error:", err);
      // Revert on error
      setMyStatusLocal(prev);
      setStatuses((m) => {
        const next = new Map(m);
        next.set(uid, prev);
        return next;
      });
    }
  }, []);

  // ── Auto-update preference ──────────────────────────────────
  const setAutoUpdate = useCallback((bool) => {
    try {
      localStorage.setItem(LS_KEY, String(bool));
    } catch { /* ignore */ }
    setAutoUpdateState(bool);
  }, []);

  // ── Idle detection ──────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // Only auto-away if currently Active
      if (myStatusRef.current === "Active") {
        wasAutoAway.current = true;
        setMyStatus("Away");
      }
    }, IDLE_TIMEOUT_MS);
  }, [setMyStatus]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottle.current < THROTTLE_MS) return;
    lastThrottle.current = now;

    // Restore to Active only if we auto-set Away
    if (wasAutoAway.current && myStatusRef.current === "Away") {
      wasAutoAway.current = false;
      setMyStatus("Active");
    }

    if (autoUpdateRef.current) {
      resetIdleTimer();
    }
  }, [resetIdleTimer, setMyStatus]);

  // Attach / detach activity listeners based on autoUpdate
  useEffect(() => {
    if (!autoUpdate) {
      clearTimeout(idleTimerRef.current);
      return;
    }

    const events = ["mousemove", "keydown", "scroll"];
    events.forEach((e) => document.addEventListener(e, handleActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, handleActivity));
      clearTimeout(idleTimerRef.current);
    };
  }, [autoUpdate, handleActivity, resetIdleTimer]);

  // ── Polling ─────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchStatuses, POLL_INTERVAL_MS);
  }, [fetchStatuses]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Initial fetch + polling setup
  useEffect(() => {
    fetchStatuses();
    startPolling();

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchStatuses();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchStatuses, startPolling, stopPolling]);

  return { statuses, myStatus, setMyStatus, autoUpdate, setAutoUpdate };
}
