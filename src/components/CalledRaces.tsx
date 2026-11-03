"use client";

/**
 * Called races: everything the source has declared a winner in, plus races
 * that look final (nearly all votes counted, no call yet) and runoffs.
 */
import { useMemo, useState } from "react";
import { STATE_BY_POSTAL } from "@/data/states";
import { flipState } from "@/lib/analysis";
import { OFFICE_NAME, PARTY_SHORT } from "@/lib/format";
import type { OfficeCode, PartyCode, Race } from "@/lib/types";
import { ChipGroup, EmptyState } from "./Filters";
import { RaceCard } from "./RaceCard";
import { useResults } from "./ResultsProvider";
import { UpdateStamp } from "./UpdateStamp";

type OfficeFilter = "all" | OfficeCode;
type PartyFilter = "all" | PartyCode;
type OutcomeFilter = "all" | "hold" | "flip";
type SortKey = "newest" | "state";

/** Reporting threshold above which an uncalled race "looks final". */
const LOOKS_FINAL_PCT = 95;

function OfficeTile({ office, races }: { office: Exclude<OfficeCode, "X">; races: Race[] }) {
  // Main races only (e.g. "S-GA", "H-GA-14"), not suffixed duplicates from a source.
  const pattern = office === "H" ? /^H-[A-Z]{2}-\d+$/ : new RegExp(`^${office}-[A-Z]{2}$`);
  const mine = races.filter((r) => r.office === office && pattern.test(r.id));
  const called = mine.filter((r) => r.status === "called");
  const by = (p: PartyCode) => called.filter((r) => r.winnerParty === p).length;
  const flips = called.filter((r) => flipState(r) === "flipped").length;
  const parts = (["D", "I", "R"] as const).map((p) => ({ p, n: by(p) })).filter((x) => x.n > 0);
  const rest = mine.length - called.length;

  return (
    <div className="tile">
      <span className="tile-label">{OFFICE_NAME[office]}</span>
      <span className="tile-big">
        {called.length}
        <small> of {mine.length} called</small>
      </span>
      <div className="vbar vbar--thin" role="img" aria-label={`${parts.map((x) => `${PARTY_SHORT[x.p]} ${x.n}`).join(", ")}, ${rest} uncalled`}>
        {parts.map((x) => (
          <div key={x.p} className={`seg seg--${x.p}`} style={{ flexGrow: x.n }} />
        ))}
        {rest > 0 ? <div className="seg seg--awaiting" style={{ flexGrow: rest }} /> : null}
      </div>
      <span className="tile-sub">
        Dem {by("D")} · Rep {by("R")}
        {by("I") ? ` · NPA ${by("I")}` : ""} · {flips} flip{flips === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function CalledRaces() {
  const { snapshot } = useResults();
  const [office, setOffice] = useState<OfficeFilter>("all");
  const [party, setParty] = useState<PartyFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");

  const races = snapshot.races;
  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () => (r: Race) => {
      if (office !== "all" && r.office !== office) return false;
      if (q) {
        const hay = [STATE_BY_POSTAL[r.state]?.name, r.state, r.title, r.officeName, ...r.candidates.map((c) => c.name)];
        if (!hay.some((s) => s?.toLowerCase().includes(q))) return false;
      }
      return true;
    },
    [office, q],
  );

  const called = races
    .filter((r) => r.status === "called" && matches(r))
    .filter((r) => party === "all" || r.winnerParty === party)
    .filter((r) => {
      if (outcome === "all") return true;
      const flipped = flipState(r) === "flipped";
      return outcome === "flip" ? flipped : !flipped && !!r.heldBy;
    })
    .sort((a, b) =>
      sort === "newest"
        ? (b.calledAt ?? "").localeCompare(a.calledAt ?? "") || a.id.localeCompare(b.id)
        : a.state.localeCompare(b.state) || a.id.localeCompare(b.id),
    );

  const looksFinal = races
    .filter((r) => r.status === "counting" && (r.reportingPct ?? 0) >= LOOKS_FINAL_PCT && matches(r))
    .sort((a, b) => (b.reportingPct ?? 0) - (a.reportingPct ?? 0));
  const runoffs = races.filter((r) => r.status === "runoff" && matches(r));

  const officeCount = (o: OfficeFilter) => races.filter((r) => r.status === "called" && (o === "all" || r.office === o)).length;

  return (
    <div className="dash">
      <section className="page-head">
        <p className="eyebrow">Called races</p>
        <h1>Races with a declared winner</h1>
        <p className="lede">
          Contests the results source has called, newest first, plus races that look final (at least {LOOKS_FINAL_PCT}% of
          the expected vote counted) but haven’t been called yet.
        </p>
        <UpdateStamp at={snapshot.fetchedAt} />
      </section>

      <div className="tiles">
        <OfficeTile office="S" races={races} />
        <OfficeTile office="H" races={races} />
        <OfficeTile office="G" races={races} />
      </div>

      <div className="filters">
        <ChipGroup<OfficeFilter>
          label="Office"
          value={office}
          onChange={setOffice}
          options={[
            { value: "all", label: "All", count: officeCount("all") },
            { value: "S", label: "Senate", count: officeCount("S") },
            { value: "H", label: "House", count: officeCount("H") },
            { value: "G", label: "Governor", count: officeCount("G") },
            { value: "X", label: "Other", count: officeCount("X") },
          ]}
        />
        <ChipGroup<PartyFilter>
          label="Winner"
          value={party}
          onChange={setParty}
          options={[
            { value: "all", label: "Any" },
            { value: "D", label: "Dem" },
            { value: "R", label: "Rep" },
            { value: "I", label: "NPA / other" },
          ]}
        />
        <ChipGroup<OutcomeFilter>
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: "all", label: "All" },
            { value: "hold", label: "Holds" },
            { value: "flip", label: "Flips" },
          ]}
        />
        <ChipGroup<SortKey>
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "newest", label: "Newest call" },
            { value: "state", label: "State A–Z" },
          ]}
        />
        <input
          type="search"
          className="search"
          placeholder="Search state, district or candidate"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search called races"
        />
      </div>

      {runoffs.length ? (
        <section className="dash-section" aria-labelledby="runoff-h">
          <h2 id="runoff-h" className="dash-title">
            Headed to a runoff <span className="count">{runoffs.length}</span>
          </h2>
          <div className="grid-cards">{runoffs.map((r) => <RaceCard key={r.id} race={r} withState />)}</div>
        </section>
      ) : null}

      <section className="dash-section" aria-labelledby="called-h">
        <h2 id="called-h" className="dash-title">
          Called <span className="count">{called.length}</span>
        </h2>
        {called.length ? (
          <div className="grid-compact grid-compact--wide">
            {called.map((r) => <RaceCard key={r.id} race={r} variant="compact" withState />)}
          </div>
        ) : (
          <EmptyState title={officeCount("all") ? "No called races match these filters" : "No races have been called yet"}>
            {officeCount("all")
              ? "Try a different office, party or search."
              : "Calls start shortly after the first polls close at 7:00 PM ET. Uncontested races are usually called right at poll close."}
          </EmptyState>
        )}
      </section>

      <section className="dash-section" aria-labelledby="final-h">
        <h2 id="final-h" className="dash-title">
          Looks final, not yet called <span className="count">{looksFinal.length}</span>
          <span className="dash-hint">{LOOKS_FINAL_PCT}%+ of expected vote counted</span>
        </h2>
        {looksFinal.length ? (
          <div className="grid-compact grid-compact--wide">
            {looksFinal.map((r) => <RaceCard key={r.id} race={r} variant="compact" withState />)}
          </div>
        ) : (
          <EmptyState title="Nothing in this state yet">Races that are nearly fully counted but still uncalled will show up here.</EmptyState>
        )}
      </section>
    </div>
  );
}
