"use client";

/**
 * Client-side home of the results snapshot.
 *
 * - Starts from the snapshot the server rendered (instant first paint).
 * - Schedules the next poll for the moment the server's cache expires
 *   (`nextRefreshAt`), so the browser asks exactly when new data can exist —
 *   that's the "every 5 minutes" cadence, without drifting out of sync.
 * - `refresh()` powers every "Update now" button (POST = force refresh).
 * - Catches up immediately if the tab was hidden past its refresh time.
 * - On failure the previous snapshot stays on screen (no blank flash).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/types";

interface ResultsContextValue {
  snapshot: Snapshot;
  refreshing: boolean;
  error: string | null;
  /** When this browser last received a snapshot (ISO). */
  receivedAt: string;
  /** Force a refresh. Resolves with the snapshot received (null on error). */
  refresh: () => Promise<Snapshot | null>;
}

const ResultsContext = createContext<ResultsContextValue | null>(null);

const MIN_POLL_MS = 30_000;

export function ResultsProvider({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState(initial.fetchedAt);
  const inflight = useRef<Promise<Snapshot | null> | null>(null);

  const load = useCallback((force: boolean): Promise<Snapshot | null> => {
    // Share one request between simultaneous clicks/timers.
    if (inflight.current) return inflight.current;
    setRefreshing(true);
    inflight.current = (async () => {
      try {
        const res = await fetch("/api/results", { method: force ? "POST" : "GET", cache: "no-store" });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const next = (await res.json()) as Snapshot;
        setSnapshot(next);
        setReceivedAt(new Date().toISOString());
        setError(null);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        setReceivedAt(new Date().toISOString()); // reschedule the timer
        return null;
      } finally {
        setRefreshing(false);
        inflight.current = null;
      }
    })();
    return inflight.current;
  }, []);

  // Poll when the server's cache expires (plus a little slack), never more
  // often than every 30 s and never less often than the configured interval.
  useEffect(() => {
    const intervalMs = snapshot.refreshIntervalSeconds * 1000;
    const untilExpiry = Date.parse(snapshot.nextRefreshAt) - Date.now() + 1500;
    const delay = Math.min(intervalMs, Math.max(MIN_POLL_MS, untilExpiry));
    const timer = setTimeout(() => load(false), delay);
    return () => clearTimeout(timer);
  }, [snapshot, receivedAt, load]);

  // Background tabs throttle timers; catch up as soon as the tab is visible.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() > Date.parse(snapshot.nextRefreshAt)) load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [snapshot.nextRefreshAt, load]);

  const refresh = useCallback(() => load(true), [load]);
  const value = useMemo(
    () => ({ snapshot, refreshing, error, receivedAt, refresh }),
    [snapshot, refreshing, error, receivedAt, refresh],
  );
  return <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>;
}

export function useResults(): ResultsContextValue {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error("useResults must be used inside <ResultsProvider>");
  return ctx;
}

/** A ticking clock for countdowns. Returns null until mounted, so server and
 *  client render identical HTML (no hydration mismatch). */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
