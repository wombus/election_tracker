/**
 * Associated Press Elections API (v3) provider.
 *
 * AP is the source behind nearly every U.S. news organization's results page:
 * it tabulates every race on the ballot (federal, statewide, legislative,
 * ballot measures) and makes the race calls. It requires an API key:
 * https://developer.ap.org/ap-elections-api/
 *
 * Request:  GET https://api.ap.org/v3/elections/{date}?format=json&level=state
 * Response: { races: [{ raceID, officeID, officeName, seatName, seatNum,
 *             reportingUnits: [{ level, statePostal, lastUpdated, eevp,
 *               precinctsReportingPct, candidates: [{ first, last, party,
 *               voteCount, winner, incumbent }] }] }] }
 *
 * `winner` is "X" for a declared winner, "R" for a runoff qualifier, and "N"
 * when an earlier call was retracted.
 */
import { finalizeRace } from "../analysis";
import { ELECTION_DATE } from "../config";
import { APPORTIONMENT, districtLabel, raceId } from "../roster";
import type { Candidate, OfficeCode, PartyCode, Race } from "../types";
import { ProviderError, type Provider } from "./types";

interface ApCandidate {
  candidateID?: string;
  polID?: string;
  first?: string;
  last?: string;
  party?: string;
  voteCount?: number;
  winner?: string;
  incumbent?: boolean;
  winnerDateTime?: string;
}

interface ApReportingUnit {
  level?: string;
  statePostal?: string;
  lastUpdated?: string;
  eevp?: number;
  precinctsReporting?: number;
  precinctsTotal?: number;
  precinctsReportingPct?: number;
  candidates?: ApCandidate[];
}

export interface ApRace {
  raceID: string;
  statePostal?: string;
  raceType?: string;
  officeID?: string;
  officeName?: string;
  seatName?: string;
  seatNum?: string;
  description?: string;
  eevp?: number;
  lastUpdated?: string;
  uncontested?: boolean;
  reportingUnits?: ApReportingUnit[];
}

const API_BASE = "https://api.ap.org/v3/elections";

const OFFICE_MAP: Record<string, OfficeCode> = { S: "S", H: "H", G: "G" };

/** AP party abbreviations → our three display buckets. */
export function apParty(abbrev: string | undefined): PartyCode {
  switch ((abbrev ?? "").toLowerCase()) {
    case "dem":
    case "dfl": // Minnesota Democratic-Farmer-Labor
      return "D";
    case "gop":
    case "rep":
      return "R";
    default:
      return "I";
  }
}

function candidateName(c: ApCandidate): string {
  return [c.first, c.last].filter(Boolean).join(" ") || "Unknown";
}

/** Translate one AP race into our normalized Race. Exported for unit tests. */
export function normalizeApRace(race: ApRace, roster: Map<string, Race>): Race | null {
  const ru = race.reportingUnits?.find((u) => u.level === "state") ?? race.reportingUnits?.[0];
  const state = ru?.statePostal ?? race.statePostal;
  if (!ru || !state) return null;

  const office = OFFICE_MAP[race.officeID ?? ""] ?? "X";
  const isBallotMeasure = race.officeID === "I";

  let id: string;
  let district: number | undefined;
  if (office === "H") {
    // At-large states are district 0 in our roster regardless of AP's seatNum.
    district = APPORTIONMENT[state] === 1 ? 0 : Number.parseInt(race.seatNum ?? "", 10);
    if (!Number.isFinite(district)) return null;
    id = raceId("H", state, district);
  } else if (office === "S" || office === "G") {
    id = raceId(office, state);
  } else {
    id = `X-${state}-${race.raceID}`;
  }

  const base = roster.get(id);
  const reportingPct =
    ru.eevp ?? race.eevp ?? ru.precinctsReportingPct ??
    (ru.precinctsTotal ? ((ru.precinctsReporting ?? 0) / ru.precinctsTotal) * 100 : null);

  const candidates: Candidate[] = (ru.candidates ?? []).map((c, i) => ({
    id: c.candidateID ?? c.polID ?? `${race.raceID}-${i}`,
    name: candidateName(c),
    party: isBallotMeasure ? "I" : apParty(c.party),
    partyLabel: isBallotMeasure ? candidateName(c) : (c.party ?? ""),
    votes: c.voteCount ?? 0,
    pct: 0,
    incumbent: c.incumbent || undefined,
    winner: c.winner === "X" || undefined,
    runoff: c.winner === "R" || undefined,
  }));

  const calledAt = ru.candidates?.find((c) => c.winner === "X")?.winnerDateTime ?? null;
  const officeName = race.officeName ?? base?.officeName ?? "Race";

  return finalizeRace({
    id,
    state,
    office,
    officeName,
    title: base?.title ?? (office === "H" ? districtLabel(state, district!) : race.seatName || officeName),
    subtitle: base?.subtitle ?? (isBallotMeasure ? race.description : race.seatName) ?? undefined,
    district,
    special: base?.special ?? /unexpired|special/i.test(`${race.seatName ?? ""} ${race.raceType ?? ""}`),
    isBallotMeasure: isBallotMeasure || undefined,
    heldBy: base?.heldBy ?? null,
    holder: base?.holder,
    candidates,
    totalVotes: 0,
    reportingPct: reportingPct == null ? null : Math.min(100, Math.max(0, reportingPct)),
    status: "awaiting",
    winnerParty: null,
    calledAt,
    calledBy: candidates.some((c) => c.winner) ? "AP" : undefined,
    lastUpdated: ru.lastUpdated ?? race.lastUpdated ?? null,
    source: "ap",
    pollClose: base?.pollClose,
    note: base?.note,
    newLines: base?.newLines,
  });
}

export const apProvider: Provider = {
  id: "ap",
  name: "Associated Press",
  url: "https://developer.ap.org/ap-elections-api/",

  async fetchRaces({ config, roster, signal }) {
    if (!config.apApiKey) throw new ProviderError("AP_API_KEY is not set");

    const url = new URL(`${API_BASE}/${ELECTION_DATE}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("level", "state");
    url.searchParams.set("resultsType", config.apTestMode ? "t" : "l");
    if (config.apOfficeIds) url.searchParams.set("officeID", config.apOfficeIds);

    const res = await fetch(url, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json", "x-api-key": config.apApiKey },
    });
    if (!res.ok) throw new ProviderError(`AP responded ${res.status} ${res.statusText}`, res.status);

    const body = (await res.json()) as { races?: ApRace[] };
    const byId = new Map(roster.map((r) => [r.id, r]));
    const out: Race[] = [];
    const seen = new Set<string>();
    for (const apRace of body.races ?? []) {
      const race = normalizeApRace(apRace, byId);
      if (!race) continue;
      // Two AP races mapping to one key (rare) — keep both, suffix the second.
      if (seen.has(race.id)) race.id = `${race.id}-${apRace.raceID}`;
      seen.add(race.id);
      out.push(race);
    }
    return out;
  },
};
