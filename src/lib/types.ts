/**
 * The app's normalized data model.
 *
 * Every data source (AP, a custom JSON feed, the simulator) is translated into
 * these shapes by its provider. The UI never sees a source's raw format, which
 * is what lets us swap or stack sources without touching a single component.
 */

/** Display buckets: D = blue, R = red, I = gray (independent / NPA / other). */
export type PartyCode = "D" | "R" | "I";

/** S = U.S. Senate, H = U.S. House, G = Governor, X = everything else
 *  (statewide offices, legislative seats, ballot measures, mayors…). */
export type OfficeCode = "S" | "H" | "G" | "X";

/**
 * awaiting – no votes reported yet
 * counting – votes are coming in, no winner declared
 * called   – the source has declared a winner
 * runoff   – no one cleared the threshold; top finishers advance (e.g. Georgia)
 */
export type RaceStatus = "awaiting" | "counting" | "called" | "runoff";

export interface Candidate {
  id: string;
  name: string;
  party: PartyCode;
  /** The source's own party label, e.g. "Dem", "GOP", "Lib", or "Yes"/"No". */
  partyLabel: string;
  votes: number;
  /** Share of all votes cast in this race, 0–100. */
  pct: number;
  incumbent?: boolean;
  winner?: boolean;
  runoff?: boolean;
}

export interface Race {
  /** Stable key: "S-GA", "G-GA", "H-GA-14", "H-AK-0" (at-large), "X-GA-<id>". */
  id: string;
  state: string;
  office: OfficeCode;
  /** e.g. "U.S. Senate", "U.S. House", "Governor", "Attorney General". */
  officeName: string;
  /** Short display label, e.g. "GA-14", "Senate", "Amendment 1". */
  title: string;
  /** Extra context such as "Special election" or a ballot measure summary. */
  subtitle?: string;
  district?: number;
  special?: boolean;
  isBallotMeasure?: boolean;
  /** Party currently holding the seat (from the roster). Basis for flip calls. */
  heldBy?: PartyCode | null;
  /** Current officeholder's name, when known. */
  holder?: string;
  candidates: Candidate[];
  totalVotes: number;
  /** Estimated share of the expected vote counted, 0–100. null = unknown. */
  reportingPct: number | null;
  status: RaceStatus;
  winnerParty: PartyCode | null;
  /** ISO timestamp the race was called, if the source provides it. */
  calledAt: string | null;
  /** Whose call this is, e.g. "AP" or "Decision Desk HQ". */
  calledBy?: string;
  /** ISO timestamp the source last changed this race's numbers. */
  lastUpdated: string | null;
  /** Which provider supplied the live numbers ("ap", "feed", "demo", "roster"). */
  source: string;
  /** ISO timestamp of the last statewide poll close. */
  pollClose?: string;
  /** Caveats worth showing next to the race (e.g. a vacancy). */
  note?: string;
  /** The district was redrawn for 2026, so "held by" is the current member
   *  for this district number rather than for identical lines. */
  newLines?: boolean;
}

export interface SourceStatus {
  id: string;
  name: string;
  url?: string;
  ok: boolean;
  error?: string;
  /** ISO time of the last attempt. */
  checkedAt: string;
  /** ISO time of the last successful pull (may be older than checkedAt). */
  lastSuccessAt: string | null;
  raceCount: number;
  simulated?: boolean;
}

export interface PartyTally {
  /** Seats won outright tonight. */
  won: number;
  /** Seats where this party leads but no call yet. */
  leading: number;
  /** Seats not on the ballot this year that this party already holds. */
  holdover: number;
}

export interface ChamberTally {
  D: PartyTally;
  R: PartyTally;
  I: PartyTally;
  /** Seats on the ballot with no votes reported yet. */
  awaiting: number;
  /** Total seats in the body (100, 435, 50). */
  total: number;
  /** Seats needed for control. */
  majority: number;
  /** Seats on the ballot tonight. */
  up: number;
}

export interface Snapshot {
  electionDate: string;
  /** When the server last pulled from the sources (ISO). */
  fetchedAt: string;
  /** When the server's cache expires and the next pull happens (ISO). */
  nextRefreshAt: string;
  refreshIntervalSeconds: number;
  sources: SourceStatus[];
  /** True when any race shown comes from the simulator. */
  simulated: boolean;
  /** True when no live source is configured at all. */
  rosterOnly: boolean;
  /** The simulator's virtual election-night clock (ISO), when it's active. */
  simulatedClock?: string;
  races: Race[];
  tallies: {
    senate: ChamberTally;
    house: ChamberTally;
    governors: ChamberTally;
  };
}
