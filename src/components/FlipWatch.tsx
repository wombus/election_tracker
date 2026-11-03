"use client";

/**
 * Flip Watch: every race where a different party than the incumbent party is
 * winning (called) or leading (counting), plus seats the holding party is
 * barely keeping.
 */
import { useMemo, useState } from "react";
import { flipConfidence, flipState, leadingParty, marginPts, type FlipState } from "@/lib/analysis";
import { OFFICE_NAME, PARTY_SHORT } from "@/lib/format";
import type { OfficeCode, PartyCode, Race } from "@/lib/types";
import { ChipGroup, EmptyState } from "./Filters";
import { RaceCard } from "./RaceCard";
import { useResults } from "./ResultsProvider";
import { UpdateStamp } from "./UpdateStamp";

type OfficeFilter = "all" | Exclude<OfficeCode, "X">;
type PartyFilter = "all" | PartyCode;
type SortKey = "likely" | "closest" | "counted";

const SORTS: Record<SortKey, (a: Race, b: Race) => number> = {
  likely: (a, b) => flipConfidence(b) - flipConfidence(a),
  closest: (a, b) => marginPts(a) - marginPts(b),
  counted: (a, b) => (b.reportingPct ?? 0) - (a.reportingPct ?? 0),
};

function NetTile({ office, races }: { office: Exclude<OfficeCode, "X">; races: { race: Race; state: FlipState }[] }) {
  const mine = races.filter((r) => r.race.office === office);
  const net = (state: FlipState) => {
    const gains: Record<PartyCode, number> = { D: 0, R: 0, I: 0 };
    for (const { race, state: s } of mine) {
      if (s !== state) continue;
      const to = leadingParty(race);
      if (to) gains[to] += 1;
      if (race.heldBy) gains[race.heldBy] -= 1;
    }
    return gains;
  };
  const confirmed = net("flipped");
  const trending = net("trending");
  const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
  return (
    <div className="tile">
      <span className="tile-label">{OFFICE_NAME[office]} net change</span>
      <div className="tile-values">
        {(["D", "R"] as const).map((p) => (
          <span key={p} className="tile-value">
            <span className={`dot dot--${p}`} aria-hidden="true" />
            {PARTY_SHORT[p]} <b>{fmt(confirmed[p])}</b>
          </span>
        ))}
        {confirmed.I !== 0 ? (
          <span className="tile-value">
            <span className="dot dot--I" aria-hidden="true" />
            NPA <b>{fmt(confirmed.I)}</b>
          </span>
        ) : null}
      </div>
      <span className="tile-sub">
        Called flips only. If current leads hold: Dem {fmt(confirmed.D + trending.D)}, Rep {fmt(confirmed.R + trending.R)}
      </span>
    </div>
  );
}

export function FlipWatch() {
  const { snapshot } = useResults();
  const [office, setOffice] = useState<OfficeFilter>("all");
  const [party, setParty] = useState<PartyFilter>("all");
  const [sort, setSort] = useState<SortKey>("likely");

  const all = useMemo(
    () =>
      snapshot.races
        .map((race) => ({ race, state: flipState(race) }))
        .filter((x): x is { race: Race; state: Exclude<FlipState, null> } => x.state !== null),
    [snapshot.races],
  );

  const visible = all.filter(
    ({ race, state }) =>
      (office === "all" || race.office === office) &&
      (party === "all" || (state === "at-risk" ? race.heldBy !== party : leadingParty(race) === party)),
  );
  const flipped = visible.filter((x) => x.state === "flipped").map((x) => x.race)
    .sort((a, b) => (b.calledAt ?? "").localeCompare(a.calledAt ?? ""));
  const trending = visible.filter((x) => x.state === "trending").map((x) => x.race).sort(SORTS[sort]);
  const atRisk = visible.filter((x) => x.state === "at-risk").map((x) => x.race).sort(SORTS.closest);

  const count = (o: OfficeFilter) => all.filter((x) => x.state !== "at-risk" && (o === "all" || x.race.office === o)).length;

  return (
    <div className="dash">
      <section className="page-head">
        <p className="eyebrow">Flip Watch</p>
        <h1>Seats that could change hands</h1>
        <p className="lede">
          Races where the declared winner, or the leader in the current count, belongs to a different party than the one
          holding the seat today. Early leads can reverse as more ballots are counted.
        </p>
        <UpdateStamp at={snapshot.fetchedAt} />
      </section>

      <div className="tiles">
        <NetTile office="S" races={all} />
        <NetTile office="H" races={all} />
        <NetTile office="G" races={all} />
      </div>

      <div className="filters">
        <ChipGroup<OfficeFilter>
          label="Office"
          value={office}
          onChange={setOffice}
          options={[
            { value: "all", label: "All", count: count("all") },
            { value: "S", label: "Senate", count: count("S") },
            { value: "H", label: "House", count: count("H") },
            { value: "G", label: "Governor", count: count("G") },
          ]}
        />
        <ChipGroup<PartyFilter>
          label="Gaining"
          value={party}
          onChange={setParty}
          options={[
            { value: "all", label: "Any party" },
            { value: "D", label: "Dem" },
            { value: "R", label: "Rep" },
            { value: "I", label: "NPA" },
          ]}
        />
        <ChipGroup<SortKey>
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "likely", label: "Most likely" },
            { value: "closest", label: "Closest" },
            { value: "counted", label: "Most counted" },
          ]}
        />
      </div>

      <section className="dash-section" aria-labelledby="flipped-h">
        <h2 id="flipped-h" className="dash-title">
          Flipped <span className="count">{flipped.length}</span>
          <span className="dash-hint">Called for a different party</span>
        </h2>
        {flipped.length ? (
          <div className="grid-cards">{flipped.map((r) => <RaceCard key={r.id} race={r} withState />)}</div>
        ) : (
          <EmptyState title="No seats have flipped yet">A race appears here once it’s called for a party other than the one holding the seat.</EmptyState>
        )}
      </section>

      <section className="dash-section" aria-labelledby="trend-h">
        <h2 id="trend-h" className="dash-title">
          Trending toward a flip <span className="count">{trending.length}</span>
          <span className="dash-hint">The challenging party leads the count</span>
        </h2>
        {trending.length ? (
          <div className="grid-cards">{trending.map((r) => <RaceCard key={r.id} race={r} withState />)}</div>
        ) : (
          <EmptyState title="No challengers ahead right now">
            As votes are counted, any race where the challenging party takes the lead shows up here.
          </EmptyState>
        )}
      </section>

      <section className="dash-section" aria-labelledby="risk-h">
        <h2 id="risk-h" className="dash-title">
          At risk <span className="count">{atRisk.length}</span>
          <span className="dash-hint">Holding party ahead by less than 3 points</span>
        </h2>
        {atRisk.length ? (
          <div className="grid-cards">{atRisk.map((r) => <RaceCard key={r.id} race={r} withState />)}</div>
        ) : (
          <EmptyState title="No narrow holds">Seats where the holding party leads by under 3 points will appear here.</EmptyState>
        )}
      </section>
    </div>
  );
}
