"use client";

import { flipState, leadingParty, marginPts } from "@/lib/analysis";
import { PARTY_SHORT, pct, timeET, votes } from "@/lib/format";
import type { Race } from "@/lib/types";
import { STATE_BY_POSTAL } from "@/data/states";
import { ArrowIcon, CheckIcon } from "./icons";
import { UpdateStamp } from "./UpdateStamp";
import { VoteBar } from "./VoteBar";

export function raceHeading(race: Race, withState: boolean): string {
  const state = STATE_BY_POSTAL[race.state]?.name ?? race.state;
  if (race.office === "H") return race.title;
  if (!withState) return race.title;
  return race.office === "X" ? `${state} · ${race.title}` : `${state} ${race.title}`;
}

/** Status chip: polls-close time, counting %, called, runoff. */
export function StatusChip({ race, compact = false }: { race: Race; compact?: boolean }) {
  if (race.status === "called") {
    const p = race.winnerParty ?? "I";
    return (
      <span className="chip chip--called" title={`Called${race.calledBy ? ` by ${race.calledBy}` : ""}${race.calledAt ? ` at ${timeET(race.calledAt)}` : ""}`}>
        <span className={`dot dot--${race.isBallotMeasure ? "I" : p}`} aria-hidden="true" />
        <CheckIcon size={12} />
        {race.isBallotMeasure ? `Called: ${race.candidates.find((c) => c.winner)?.name ?? ""}` : `Called · ${PARTY_SHORT[p]}`}
      </span>
    );
  }
  if (race.status === "runoff") return <span className="chip chip--runoff">Runoff</span>;
  if (race.status === "counting") {
    return (
      <span className="chip chip--counting">
        <span className="live-dot" aria-hidden="true" />
        {race.reportingPct != null ? `${Math.round(race.reportingPct)}% in` : "Counting"}
      </span>
    );
  }
  const closesLater = race.pollClose && Date.parse(race.pollClose) > Date.now();
  return (
    <span className="chip chip--awaiting" suppressHydrationWarning>
      {closesLater ? `${compact ? "Closes" : "Polls close"} ${timeET(race.pollClose)}` : compact ? "Awaiting" : "Awaiting results"}
    </span>
  );
}

/** "FLIP R → D", "Trending R → D", or "At risk" badge. */
export function FlipBadge({ race }: { race: Race }) {
  const state = flipState(race);
  if (!state || !race.heldBy) return null;
  const to = leadingParty(race);
  if (state === "at-risk") return <span className="badge badge--risk">At risk</span>;
  return (
    <span className={`badge ${state === "flipped" ? "badge--flip" : "badge--trend"}`}>
      {state === "flipped" ? "Flip" : "Trending"}
      <span className="badge-parties">
        {race.heldBy}
        <ArrowIcon size={10} />
        {to}
      </span>
    </span>
  );
}

function HeldBy({ race }: { race: Race }) {
  if (race.isBallotMeasure) return race.subtitle ? <span>{race.subtitle}</span> : null;
  if (!race.heldBy) return race.subtitle ? <span>{race.subtitle}</span> : null;
  return (
    <span className="held">
      <span className={`dot dot--${race.heldBy}`} aria-hidden="true" />
      Held by {PARTY_SHORT[race.heldBy]}
      {race.holder ? <span className="held-name"> · {race.holder}</span> : null}
    </span>
  );
}

export function RaceCard({
  race,
  variant = "full",
  withState = false,
  action,
}: {
  race: Race;
  variant?: "full" | "compact";
  withState?: boolean;
  /** Optional extra control (e.g. "All Georgia races →") shown at the bottom. */
  action?: React.ReactNode;
}) {
  const compact = variant === "compact";
  const shown = compact ? race.candidates.slice(0, 2) : race.candidates.slice(0, 3);
  const hidden = race.candidates.length - shown.length;
  const margin = marginPts(race);

  return (
    <article className={`race race--${variant} race--${race.status}`} aria-label={raceHeading(race, true)}>
      <header className="race-head">
        <div className="race-title">
          <h3>{raceHeading(race, withState)}</h3>
          {race.special && race.office !== "X" ? <span className="tag">Special</span> : null}
          {race.newLines ? (
            <span className="tag" title="This state redrew its House map for 2026. “Held by” shows the current member for this district number, whose old district may differ from the new lines.">
              New map
            </span>
          ) : null}
          <FlipBadge race={race} />
        </div>
        <StatusChip race={race} compact={compact} />
      </header>

      <div className="race-meta">
        <HeldBy race={race} />
        {race.status === "called" && !compact ? (
          <span className="race-meta-r" title={race.calledAt ? `Called ${timeET(race.calledAt)}` : undefined}>
            Called by {race.calledBy ?? "source"}
            {race.reportingPct != null ? ` · ${pct(race.reportingPct, 0)} in` : ""}
          </span>
        ) : race.status !== "awaiting" && race.reportingPct != null && !compact ? (
          <span className="race-meta-r">{pct(race.reportingPct, 0)} of expected vote</span>
        ) : null}
      </div>

      {shown.length > 0 && race.totalVotes > 0 ? (
        <ul className="cands">
          {shown.map((c) => (
            <li key={c.id} className={`cand ${c.winner ? "cand--won" : ""}`}>
              <span className={`swatch ${race.isBallotMeasure ? (/^no/i.test(c.name) ? "seg--no" : "seg--yes") : `seg--${c.party}`}`} aria-hidden="true" />
              <span className="cand-name">
                <span className="cand-n">{c.name}</span>
                {!race.isBallotMeasure ? <span className="cand-party">{c.partyLabel || c.party}</span> : null}
                {c.incumbent ? <span className="cand-inc" title="Incumbent">Inc.</span> : null}
                {c.winner ? <CheckIcon className="cand-check" size={13} /> : null}
              </span>
              <span className="cand-pct">{pct(c.pct)}</span>
              {!compact ? <span className="cand-votes">{votes(c.votes)}</span> : null}
            </li>
          ))}
          {hidden > 0 && !compact ? <li className="cand-more">+{hidden} more candidate{hidden > 1 ? "s" : ""}</li> : null}
        </ul>
      ) : (
        <p className="race-empty">
          {race.candidates.length > 0
            ? race.candidates.slice(0, 3).map((c) => c.name).join(" vs. ")
            : "No votes reported yet."}
        </p>
      )}

      <VoteBar race={race} size={compact ? "thin" : "tall"} />
      {compact && race.totalVotes > 0 ? (
        <div className="race-compact-meta">
          <span>{race.reportingPct != null ? `${Math.round(race.reportingPct)}% in` : ""}</span>
          <span>{margin > 0 ? `+${margin.toFixed(1)} pts` : ""}</span>
        </div>
      ) : null}
      <UpdateStamp at={race.lastUpdated} compact={compact} />
      {race.note && !compact ? <p className="race-note">{race.note}</p> : null}
      {action ? <div className="race-action">{action}</div> : null}
    </article>
  );
}
