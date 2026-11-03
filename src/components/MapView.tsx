"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATE_BY_POSTAL, STATES } from "@/data/states";
import { marginPts } from "@/lib/analysis";
import { mapFills, MODE_LABEL, type MapMode } from "@/lib/map-fills";
import { BalanceOfPower } from "./BalanceOfPower";
import { RaceCard } from "./RaceCard";
import { useResults } from "./ResultsProvider";
import { StatePanel } from "./StatePanel";
import { USMap } from "./USMap";

const MODES: MapMode[] = ["S", "G", "H"];

function Legend({ mode }: { mode: MapMode }) {
  if (mode === "H") {
    return (
      <div className="legend" aria-label="Legend: share of the state's House seats won or led">
        <span className="legend-title">Seats won or leading</span>
        <span className="legend-scale">
          <i className="sw fill--D" title="80%+ Dem" />
          <i className="sw fill--D-lean" title="55–80% Dem" />
          <i className="sw fill--I-lean" title="Even split" />
          <i className="sw fill--R-lean" title="55–80% Rep" />
          <i className="sw fill--R" title="80%+ Rep" />
        </span>
        <span className="legend-ends"><span>Mostly Dem</span><span>Even</span><span>Mostly Rep</span></span>
        <span className="legend-item"><i className="sw fill--pending" />Awaiting</span>
      </div>
    );
  }
  return (
    <div className="legend" aria-label="Map legend">
      <span className="legend-item"><i className="sw fill--D" />Dem won</span>
      <span className="legend-item"><i className="sw fill--D-lean" />Dem leading</span>
      <span className="legend-item"><i className="sw fill--I" />NPA / other</span>
      <span className="legend-item"><i className="sw fill--R-lean" />Rep leading</span>
      <span className="legend-item"><i className="sw fill--R" />Rep won</span>
      <span className="legend-item"><i className="sw fill--pending" />Awaiting</span>
      <span className="legend-item"><i className="sw fill--none" />No race</span>
    </div>
  );
}

function OpenState({ postal, onSelect }: { postal: string; onSelect: (p: string) => void }) {
  return (
    <button type="button" className="link-btn" onClick={() => onSelect(postal)}>
      All {STATE_BY_POSTAL[postal]?.name ?? postal} races →
    </button>
  );
}

function Overview({ mode, onSelect }: { mode: MapMode; onSelect: (p: string) => void }) {
  const { snapshot } = useResults();
  const races = snapshot.races.filter((r) => r.office === mode);
  const latestCalls = races
    .filter((r) => r.status === "called")
    .sort((a, b) => (b.calledAt ?? "").localeCompare(a.calledAt ?? ""))
    .slice(0, 4);
  const closest = races
    .filter((r) => r.status === "counting" && (r.reportingPct ?? 0) >= 10)
    .sort((a, b) => marginPts(a) - marginPts(b))
    .slice(0, 4);

  return (
    <section className="panel panel--overview" aria-label="Overview">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Tap or click any state</p>
          <h2>Every race, state by state</h2>
          <p className="panel-sub">
            The map shows {MODE_LABEL[mode].toLowerCase()} results. Pick a state to see its Senate, governor, every
            House district and every other contest the source reports.
          </p>
        </div>
      </header>
      {closest.length > 0 ? (
        <div className="panel-section">
          <h3 className="section-title">Closest {MODE_LABEL[mode].toLowerCase()} races right now</h3>
          {closest.map((r) => (
            <RaceCard key={r.id} race={r} variant={mode === "H" ? "compact" : "full"} withState action={<OpenState postal={r.state} onSelect={onSelect} />} />
          ))}
        </div>
      ) : null}
      {latestCalls.length > 0 ? (
        <div className="panel-section">
          <h3 className="section-title">Latest {MODE_LABEL[mode].toLowerCase()} calls</h3>
          {latestCalls.map((r) => (
            <RaceCard key={r.id} race={r} variant="compact" withState action={<OpenState postal={r.state} onSelect={onSelect} />} />
          ))}
        </div>
      ) : null}
      {closest.length === 0 && latestCalls.length === 0 ? (
        <p className="panel-foot">Results appear here as soon as votes are counted. The first polls close at 7:00 PM ET.</p>
      ) : null}
    </section>
  );
}

export function MapView({ initialState, initialMode }: { initialState: string | null; initialMode: MapMode }) {
  const { snapshot } = useResults();
  const [mode, setMode] = useState<MapMode>(initialMode);
  const [selected, setSelected] = useState<string | null>(initialState);

  // Keep ?state=GA&view=S in the URL so any view can be shared or bookmarked.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("state", selected);
    else url.searchParams.delete("state");
    if (mode !== "S") url.searchParams.set("view", mode);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, [selected, mode]);

  const select = useCallback((postal: string) => {
    setSelected((cur) => (cur === postal ? null : postal));
    // On narrow screens the panel sits below the map; bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => document.getElementById("state-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, []);

  const fills = useMemo(() => mapFills(snapshot.races, mode), [snapshot.races, mode]);

  return (
    <>
      <BalanceOfPower />
      <div className="map-layout">
        <section className="card map-card" aria-label="Results map">
          <div className="map-toolbar">
            <div className="tabs" role="tablist" aria-label="Map view">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={`tab ${mode === m ? "tab--active" : ""}`}
                  onClick={() => setMode(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <label className="state-picker">
              <span className="sr-only">Jump to a state</span>
              <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
                <option value="">Jump to a state…</option>
                {STATES.map((s) => (
                  <option key={s.postal} value={s.postal}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <USMap
            fills={fills}
            selected={selected}
            onSelect={select}
            ariaLabel={`United States ${MODE_LABEL[mode]} results map. Select a state to see all of its races.`}
          />
          <Legend mode={mode} />
        </section>
        <div id="state-panel" className="panel-col">
          {selected ? (
            <StatePanel postal={selected} races={snapshot.races} onClose={() => setSelected(null)} />
          ) : (
            <Overview mode={mode} onSelect={select} />
          )}
        </div>
      </div>
    </>
  );
}
