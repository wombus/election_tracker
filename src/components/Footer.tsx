"use client";

import { useResults } from "./ResultsProvider";

export function Footer() {
  const { snapshot } = useResults();
  const usingAp = snapshot.sources.some((s) => s.id === "ap");
  return (
    <footer className="site-foot">
      <div className="site-foot-inner">
        <div>
          <h2>Sources</h2>
          <ul>
            {usingAp ? (
              <li>
                Vote counts and race calls: <a href="https://www.ap.org/elections/" target="_blank" rel="noreferrer">The Associated Press</a>
              </li>
            ) : null}
            {snapshot.sources
              .filter((s) => s.id !== "ap")
              .map((s) => (
                <li key={s.id}>
                  {s.simulated ? "Simulated results: built-in simulator (not real data)" : `Results: ${s.name}`}
                </li>
              ))}
            <li>
              Seat holders:{" "}
              <a href="https://github.com/unitedstates/congress-legislators" target="_blank" rel="noreferrer">
                unitedstates/congress-legislators
              </a>
            </li>
            <li>
              State boundaries: U.S. Census Bureau via{" "}
              <a href="https://github.com/topojson/us-atlas" target="_blank" rel="noreferrer">us-atlas</a>
            </li>
          </ul>
        </div>
        <div>
          <h2>How to read this</h2>
          <p>
            Results refresh automatically every {Math.round(snapshot.refreshIntervalSeconds / 60)} minutes. “Called” means the source has
            declared a winner. A <b>flip</b> is a seat won by a different party than the one that holds it now.
            “Trending” means the challenging party leads in the current count. Early counts can swing as mail and
            Election Day ballots are added. Times are Eastern.
          </p>
        </div>
      </div>
    </footer>
  );
}
