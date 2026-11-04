/**
 * CNN results files (Decision Desk HQ data). Free, no key. FAILOVER source,
 * and a second set of race calls (DDHQ often calls races before AP does).
 *
 *   https://politics.api.cnn.io/results/national-races/2026-{SG|GG|HG}.json
 *   (S = Senate, G = Governor, H = House; the trailing G = general election)
 *
 * Like the NYT files these are public, undocumented CDN files: the format can
 * change and CNN's terms apply. Fine for a personal dashboard.
 *
 * Each file is an array of races (field names verified against real captures):
 *   { ecKey: "2026-SG-GA" | "2026-HG-CA-12", raceType: "S"|"G"|"H", stateAbbreviation,
 *     status: "U" (uncalled) | "W" (won), editorialStatus, percentReporting, totalVote,
 *     isSwitch, voteTimestamp, extractedAt,
 *     raceEmbargo: { assignedPollsClose: <epoch ms> },
 *     candidates: [{ candidateId, fullName, majorParty: "DEM"|"REP"|…, partyName,
 *                    voteNum, isIncumbent, winner, runoffCandidate }] }
 */
import { finalizeRace } from "../analysis";
import { ELECTION_DATE } from "../config";
import { APPORTIONMENT, districtLabel, raceId } from "../roster";
import type { Candidate, Race } from "../types";
import { fetchJson, partyFromLabel } from "./http";
import { ProviderError, type Provider } from "./types";

const CNN_BASE = "https://politics.api.cnn.io/results/national-races";

interface CnnCandidate {
  candidateId?: number | string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  majorParty?: string;
  partyName?: string;
  isIncumbent?: boolean;
  voteNum?: number;
  winner?: boolean;
  runoffCandidate?: boolean;
}

export interface CnnRace {
  ecKey?: string;
  raceType?: string;
  stateAbbreviation?: string;
  status?: string;
  percentReporting?: number;
  totalVote?: number;
  isSwitch?: boolean;
  voteTimestamp?: string | null;
  extractedAt?: string | null;
  raceEmbargo?: { assignedPollsClose?: number } | null;
  candidates?: CnnCandidate[];
}

/** CNN's extractedAt has no timezone suffix; it's UTC. */
function isoUtc(s: string | null | undefined): string | null {
  if (!s) return null;
  return /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
}

/** Translate one CNN race. Exported for unit tests. */
export function normalizeCnnRace(r: CnnRace, roster: Map<string, Race>): Race | null {
  const office = r.raceType;
  const state = r.stateAbbreviation;
  if ((office !== "S" && office !== "G" && office !== "H") || !state) return null;

  let id: string;
  let district: number | undefined;
  if (office === "H") {
    const fromKey = Number.parseInt((r.ecKey ?? "").split("-")[3] ?? "", 10);
    district = APPORTIONMENT[state] === 1 ? 0 : fromKey;
    if (!Number.isFinite(district)) return null;
    id = raceId("H", state, district);
  } else {
    id = raceId(office, state);
  }

  const candidates: Candidate[] = (r.candidates ?? []).map((c, i) => ({
    id: `cnn-${c.candidateId ?? `${r.ecKey}-${i}`}`,
    name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
    party: partyFromLabel(c.majorParty),
    partyLabel: c.partyName ?? c.majorParty ?? "",
    votes: c.voteNum ?? 0,
    pct: 0,
    incumbent: c.isIncumbent || undefined,
    winner: c.winner || undefined,
    runoff: c.runoffCandidate || undefined,
  }));

  const base = roster.get(id);
  const called = candidates.some((c) => c.winner);
  const updated = isoUtc(r.voteTimestamp) ?? isoUtc(r.extractedAt);

  return finalizeRace({
    id,
    state,
    office,
    officeName: base?.officeName ?? (office === "S" ? "U.S. Senate" : office === "G" ? "Governor" : "U.S. House"),
    title: base?.title ?? (office === "H" ? districtLabel(state, district!) : office === "S" ? "Senate" : "Governor"),
    subtitle: base?.subtitle,
    district,
    special: base?.special,
    heldBy: base?.heldBy ?? null,
    holder: base?.holder,
    candidates,
    totalVotes: 0,
    reportingPct: r.percentReporting == null ? null : Math.min(100, Math.max(0, r.percentReporting)),
    status: "awaiting",
    winnerParty: null,
    calledAt: called ? updated : null,
    calledBy: called ? "Decision Desk HQ" : undefined,
    lastUpdated: updated,
    source: "cnn",
    pollClose: base?.pollClose,
    note: base?.note,
    newLines: base?.newLines,
  });
}

/**
 * The national files also keep contests decided earlier in the year for the
 * same seat (e.g. a January special runoff, already marked won). Drop anything
 * whose polls closed before election day, then keep each seat's latest contest.
 */
export function normalizeCnnFile(list: CnnRace[], roster: Map<string, Race>): Race[] {
  const cutoff = Date.parse(`${ELECTION_DATE}T12:00:00Z`);
  const byId = new Map<string, { race: Race; close: number }>();
  for (const raw of list) {
    const close = raw.raceEmbargo?.assignedPollsClose ?? 0;
    if (close && close < cutoff) continue;
    const race = normalizeCnnRace(raw, roster);
    if (!race) continue;
    const prev = byId.get(race.id);
    if (!prev || close > prev.close) byId.set(race.id, { race, close });
  }
  return [...byId.values()].map((x) => x.race);
}

export const cnnProvider: Provider = {
  id: "cnn",
  name: "Decision Desk HQ via CNN",
  url: "https://www.cnn.com/election/2026",

  async fetchRaces({ roster, signal }) {
    const byId = new Map(roster.map((r) => [r.id, r]));
    const year = ELECTION_DATE.slice(0, 4);
    const files = await Promise.allSettled(
      ["SG", "GG", "HG"].map(async (code) => {
        const { data } = await fetchJson<CnnRace[] | CnnRace>(`${CNN_BASE}/${year}-${code}.json`, signal);
        return normalizeCnnFile(Array.isArray(data) ? data : [data], byId);
      }),
    );
    const ok = files.filter((f) => f.status === "fulfilled");
    if (ok.length === 0) {
      const reason = (files[0] as PromiseRejectedResult).reason;
      throw new ProviderError(reason instanceof Error ? reason.message : "CNN files unavailable");
    }
    return ok.flatMap((f) => (f as PromiseFulfilledResult<Race[]>).value);
  },
};
