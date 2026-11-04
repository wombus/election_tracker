/**
 * Pure functions that derive meaning from normalized races: status, leaders,
 * margins, flips, and chamber tallies. No I/O here — which is why this is the
 * most heavily unit-tested file in the project, and why it can run on both the
 * server (building snapshots) and the client (filtering dashboards).
 */
import type { Candidate, ChamberTally, PartyCode, PartyTally, Race } from "./types";

/**
 * Fill in derived fields (vote shares, totals, status, winner) from the raw
 * candidate list. Providers call this so they only have to supply votes and
 * any winner/runoff flags their source publishes.
 */
export function finalizeRace(race: Race): Race {
  // Sources list placeholder rows like "Total Write-ins" with 0 votes; hide those.
  const real = race.candidates.filter((c) => c.votes > 0 || c.winner || !/write-?ins?\b/i.test(c.name));
  const totalVotes = real.reduce((sum, c) => sum + c.votes, 0);
  const candidates: Candidate[] = real
    .map((c) => ({ ...c, pct: totalVotes > 0 ? (c.votes / totalVotes) * 100 : 0 }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  const winner = candidates.find((c) => c.winner);
  const runoff = !winner && candidates.some((c) => c.runoff);
  const status = winner ? "called" : runoff ? "runoff" : totalVotes > 0 ? "counting" : "awaiting";

  return {
    ...race,
    candidates,
    totalVotes,
    status,
    winnerParty: winner ? winner.party : null,
    calledAt: winner ? (race.calledAt ?? race.lastUpdated) : null,
  };
}

/** The candidate currently ahead, or null if nothing has been counted. */
export function leader(race: Race): Candidate | null {
  if (race.totalVotes <= 0) return race.candidates.find((c) => c.winner) ?? null;
  return race.candidates[0] ?? null;
}

/** Lead of first over second place, in percentage points. */
export function marginPts(race: Race): number {
  const [a, b] = race.candidates;
  if (!a || race.totalVotes <= 0) return 0;
  return a.pct - (b?.pct ?? 0);
}

/** The party that is winning (if called) or leading (if counting). */
export function leadingParty(race: Race): PartyCode | null {
  if (race.status === "called") return race.winnerParty;
  if (race.status === "awaiting") return null;
  return leader(race)?.party ?? null;
}

export type FlipState =
  /** Called for a different party than the one holding the seat. */
  | "flipped"
  /** Counting; a different party is ahead. */
  | "trending"
  /** Counting; the holding party leads, but narrowly. */
  | "at-risk"
  | null;

/** Margin (points) under which a holding party's lead is considered "at risk". */
export const AT_RISK_MARGIN = 3;

export function flipState(race: Race): FlipState {
  if (!race.heldBy || race.isBallotMeasure || race.office === "X") return null;
  if (race.status === "called") {
    const winner = race.candidates.find((c) => c.winner);
    // An incumbent who changed party labels and won again is not a "flip".
    if (winner?.incumbent) return null;
    return race.winnerParty && race.winnerParty !== race.heldBy ? "flipped" : null;
  }
  if (race.status !== "counting") return null;
  const top = leader(race);
  if (!top) return null;
  if (top.party !== race.heldBy && !top.incumbent) return "trending";
  // Two candidates of the same party (CA/WA top-two) can't flip the seat.
  const runnerUp = race.candidates[1];
  if (runnerUp && runnerUp.party !== race.heldBy && marginPts(race) < AT_RISK_MARGIN) return "at-risk";
  return null;
}

/**
 * How strongly a flip is "looking likely": more votes counted and a wider lead
 * both increase confidence. Used only to sort the Flip Watch dashboard.
 */
export function flipConfidence(race: Race): number {
  const reporting = (race.reportingPct ?? 0) / 100;
  return marginPts(race) * Math.sqrt(Math.max(reporting, 0.01));
}

function emptyTally(): PartyTally {
  return { won: 0, leading: 0, holdover: 0 };
}

/**
 * Tally a chamber: won + leading seats from tonight's races, plus holdover
 * seats (not on the ballot) by party.
 */
export function tallyChamber(
  races: Race[],
  opts: { total: number; majority: number; holdovers: Partial<Record<PartyCode, number>> },
): ChamberTally {
  const tally: ChamberTally = {
    D: emptyTally(),
    R: emptyTally(),
    I: emptyTally(),
    awaiting: 0,
    total: opts.total,
    majority: opts.majority,
    up: races.length,
  };
  for (const p of ["D", "R", "I"] as const) tally[p].holdover = opts.holdovers[p] ?? 0;

  for (const race of races) {
    const party = leadingParty(race);
    if (!party) tally.awaiting += 1;
    else if (race.status === "called") tally[party].won += 1;
    else tally[party].leading += 1;
  }
  return tally;
}

/** Seats a party has locked in (won tonight + holdovers). */
export function secured(t: PartyTally): number {
  return t.won + t.holdover;
}
