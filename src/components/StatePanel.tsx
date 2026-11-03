"use client";

/**
 * Everything on the ballot in one state: Senate, Governor, every House
 * district, then any other contests the live source reports (statewide
 * offices, legislature, ballot measures).
 */
import { useMemo, useState } from "react";
import { STATE_BY_POSTAL } from "@/data/states";
import { pollCloseIso } from "@/lib/roster";
import { timeET } from "@/lib/format";
import type { Race } from "@/lib/types";
import { CloseIcon } from "./icons";
import { RaceCard } from "./RaceCard";

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

  const mine = useMemo(() => races.filter((r) => r.state === postal), [races, postal]);
  const senate = mine.filter((r) => r.office === "S");
  const governor = mine.filter((r) => r.office === "G");
  const house = mine
    .filter((r) => r.office === "H")
    .sort((a, b) => (a.district ?? 0) - (b.district ?? 0));
  const other = groupOther(mine.filter((r) => r.office === "X"));

  const q = query.trim().toLowerCase();
  const houseShown = q
    ? house.filter((r) =>
        [r.title, r.holder, ...r.candidates.map((c) => c.name)].some((s) => s?.toLowerCase().includes(q)),
      )
    : house;

  if (!info) return null;

  return (
    <section className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">{mine.length} races on the ballot</p>
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
          {list.map((r) => <RaceCard key={r.id} race={r} />)}
        </div>
      ))}

      {other.length === 0 ? (
        <p className="panel-foot">
          Statewide offices, legislative seats and ballot measures appear here when the live results source reports
          them. The AP feed covers every contest on the ballot.
        </p>
      ) : null}
    </section>
  );
}
