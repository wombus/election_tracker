"use client";

/**
 * Everything on the ballot in one state: Senate, Governor, every House
 * district, statewide offices and ballot measures (from the main snapshot),
 * then district-level contests like the state legislature, which are loaded
 * from /api/state/{ST} when the panel opens and reloaded with each refresh.
 */
import { useEffect, useMemo, useState } from "react";
import { STATE_BY_POSTAL } from "@/data/states";
import { pollCloseIso } from "@/lib/roster";
import { timeET } from "@/lib/format";
import type { Race } from "@/lib/types";
import { CloseIcon } from "./icons";
import { RaceCard } from "./RaceCard";
import { useResults } from "./ResultsProvider";

/** Natural order for "District 2" < "District 10", "Belknap District 1" … */
const byTitle = (a: Race, b: Race) => a.title.localeCompare(b.title, "en", { numeric: true });

function matches(r: Race, q: string): boolean {
  return [r.title, r.officeName, r.holder, ...r.candidates.map((c) => c.name)].some((s) => s?.toLowerCase().includes(q));
}

/** Loads the state's district-level contests; refetches when the snapshot refreshes. */
function useLocalRaces(postal: string): { races: Race[]; loading: boolean; failed: boolean } {
  const { snapshot } = useResults();
  const [state, setState] = useState<{ postal: string; races: Race[]; failed: boolean } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/state/${postal}`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { races: Race[] }) => setState({ postal, races: body.races, failed: false }))
      .catch((err) => {
        if (err?.name !== "AbortError") setState((cur) => ({ postal, races: cur?.postal === postal ? cur.races : [], failed: true }));
      });
    return () => ctrl.abort();
  }, [postal, snapshot.fetchedAt]);
  const current = state?.postal === postal ? state : null;
  return { races: current?.races ?? [], loading: current === null, failed: current?.failed ?? false };
}

function groupOther(races: Race[]): [string, Race[]][] {
  const groups = new Map<string, Race[]>();
  for (const r of races) {
    const key = r.isBallotMeasure ? "Ballot measures" : r.officeName;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "Ballot measures" ? 1 : b === "Ballot measures" ? -1 : a.localeCompare(b),
  );
}

export function StatePanel({ postal, races, onClose }: { postal: string; races: Race[]; onClose: () => void }) {
  const info = STATE_BY_POSTAL[postal];
  const [query, setQuery] = useState("");
  const [localQuery, setLocalQuery] = useState("");
  const local = useLocalRaces(postal);

  const mine = useMemo(() => races.filter((r) => r.state === postal), [races, postal]);
  const senate = mine.filter((r) => r.office === "S");
  const governor = mine.filter((r) => r.office === "G");
  const house = mine
    .filter((r) => r.office === "H")
    .sort((a, b) => (a.district ?? 0) - (b.district ?? 0));
  const other = groupOther(mine.filter((r) => r.office === "X"));

  const q = query.trim().toLowerCase();
  const houseShown = q ? house.filter((r) => matches(r, q)) : house;

  const lq = localQuery.trim().toLowerCase();
  const localGroups = groupOther(local.races.filter((r) => !lq || matches(r, lq)));

  if (!info) return null;

  return (
    <section className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">{mine.length + local.races.length} races on the ballot</p>
          <h2 id="panel-title">{info.name}</h2>
          <p className="panel-sub">All polls closed by {timeET(pollCloseIso(info.pollClose))}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close state panel">
          <CloseIcon />
        </button>
      </header>

      {senate.length > 0 ? (
        <div className="panel-section">
          <h3 className="section-title">U.S. Senate</h3>
          {senate.map((r) => <RaceCard key={r.id} race={r} />)}
        </div>
      ) : null}

      {governor.length > 0 ? (
        <div className="panel-section">
          <h3 className="section-title">Governor</h3>
          {governor.map((r) => <RaceCard key={r.id} race={r} />)}
        </div>
      ) : null}

      {house.length > 0 ? (
        <div className="panel-section">
          <div className="section-row">
            <h3 className="section-title">
              U.S. House <span className="count">{house.length}</span>
            </h3>
            {house.length > 6 ? (
              <input
                type="search"
                className="search"
                placeholder="Find district or candidate"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={`Search ${info.name} House races`}
              />
            ) : null}
          </div>
          <div className="grid-compact">
            {houseShown.map((r) => <RaceCard key={r.id} race={r} variant="compact" />)}
          </div>
          {houseShown.length === 0 ? <p className="muted">No districts match “{query}”.</p> : null}
          {house.some((r) => r.newLines) ? (
            <p className="race-note">{info.name} redrew its House map for 2026. “Held by” shows each district number’s current member.</p>
          ) : null}
        </div>
      ) : null}

      {other.map(([title, list]) => (
        <div className="panel-section" key={title}>
          <h3 className="section-title">
            {title} <span className="count">{list.length}</span>
          </h3>
          {list.length > 4 ? (
            <div className="grid-compact">{list.sort(byTitle).map((r) => <RaceCard key={r.id} race={r} variant="compact" />)}</div>
          ) : (
            list.map((r) => <RaceCard key={r.id} race={r} />)
          )}
        </div>
      ))}

      {local.races.length > 0 ? (
        <div className="panel-section">
          <div className="section-row">
            <h3 className="section-title">
              Legislature &amp; district races <span className="count">{local.races.length}</span>
            </h3>
            <input
              type="search"
              className="search"
              placeholder="Find district or candidate"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              aria-label={`Search ${info.name} legislative and district races`}
            />
          </div>
          {localGroups.map(([title, list]) => (
            <details key={title} className="group" open={!!lq || list.length <= 12}>
              <summary>
                {title} <span className="count">{list.length}</span>
              </summary>
              <div className="grid-compact">
                {list.sort(byTitle).map((r) => <RaceCard key={r.id} race={r} variant="compact" />)}
              </div>
            </details>
          ))}
          {localGroups.length === 0 ? <p className="muted">No races match “{localQuery}”.</p> : null}
        </div>
      ) : local.loading ? (
        <p className="panel-foot">Loading legislative and district races…</p>
      ) : null}

      {other.length === 0 && local.races.length === 0 && !local.loading ? (
        <p className="panel-foot">
          {local.failed
            ? "Couldn’t load legislative and district races; they’ll retry on the next refresh."
            : "Statewide offices, legislative seats and ballot measures appear here as soon as the results source publishes them."}
        </p>
      ) : null}
    </section>
  );
}
