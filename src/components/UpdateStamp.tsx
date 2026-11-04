"use client";

/**
 * The line under every results bar: when it was last updated, plus an
 * "Update now" button that forces a refresh from the sources.
 *
 * Every race comes from the same server pull, so one click refreshes the
 * whole snapshot; the spinner shows on the button you clicked.
 */
import { useState } from "react";
import { timeET } from "@/lib/format";
import { ClockIcon, RefreshIcon } from "./icons";
import { useResults } from "./ResultsProvider";

export function UpdateStamp({
  at,
  label = "Updated",
  compact = false,
}: {
  at: string | null | undefined;
  label?: string;
  /** Narrow cards: drop the verb (the clock icon and tooltip carry it). */
  compact?: boolean;
}) {
  const { snapshot, refresh } = useResults();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const shown = at ?? snapshot.fetchedAt;
  const verb = at ? label : "Checked";

  async function onClick() {
    setBusy(true);
    setNote(null);
    const before = snapshot.fetchedAt;
    const next = await refresh();
    setBusy(false);
    // The server throttles forced refreshes; if it handed back the same pull,
    // say so instead of looking like the click did nothing.
    setNote(!next ? "Retry" : next.fetchedAt === before ? "Up to date" : null);
    setTimeout(() => setNote(null), 4000);
  }

  return (
    <div className={`stamp ${compact ? "stamp--compact" : ""}`}>
      <span
        className="stamp-time"
        title={`${verb} ${timeET(shown, true)} · server last checked sources ${timeET(snapshot.fetchedAt, true)}`}
      >
        <ClockIcon />
        <span>
          {compact ? <span className="sr-only">{verb} </span> : `${verb} `}
          <time dateTime={shown}>{timeET(shown)}</time>
        </span>
      </span>
      <button type="button" className="stamp-btn" onClick={onClick} disabled={busy} aria-live="polite">
        <RefreshIcon spinning={busy} size={12} />
        {busy ? "Updating…" : (note ?? "Update now")}
      </button>
    </div>
  );
}
