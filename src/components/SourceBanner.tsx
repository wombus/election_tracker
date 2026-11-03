"use client";

/** Honest status messaging: simulated data, no source configured, or a source failing. */
import { timeET } from "@/lib/format";
import { useResults } from "./ResultsProvider";

export function SourceBanner() {
  const { snapshot, error } = useResults();
  const failing = snapshot.sources.filter((s) => !s.ok);

  return (
    <div className="banners">
      {snapshot.simulated ? (
        <div className="banner banner--sim" role="status">
          <strong>Simulated data. These are not real results.</strong>
          <span>
            The simulator is replaying a fictional election night (virtual clock {timeET(snapshot.simulatedClock)}).
            Remove <code>demo</code> from <code>DATA_PROVIDERS</code> to use live sources.
          </span>
        </div>
      ) : null}

      {snapshot.rosterOnly ? (
        <div className="banner banner--info" role="status">
          <strong>Live sources are turned off.</strong>
          <span>
            <code>DATA_PROVIDERS</code> is set to <code>none</code>, so every race is listed with the party holding each
            seat but no votes. Remove it to use the free NYT/AP and CNN/Decision Desk feeds (see README).
          </span>
        </div>
      ) : null}

      {failing.map((s) => (
        <div key={s.id} className="banner banner--warn" role="alert">
          <strong>{s.name} isn’t responding.</strong>
          <span>
            {s.error}.{" "}
            {s.lastSuccessAt
              ? `Showing its last good data from ${timeET(s.lastSuccessAt)}; retrying automatically.`
              : "Retrying automatically."}
          </span>
        </div>
      ))}

      {error ? (
        <div className="banner banner--warn" role="alert">
          <strong>Couldn’t reach the tracker’s server.</strong>
          <span>{error}. The last results stay on screen and we’ll retry on the next cycle.</span>
        </div>
      ) : null}
    </div>
  );
}
