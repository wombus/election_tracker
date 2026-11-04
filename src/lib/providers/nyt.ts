/**
 * New York Times results files (AP data). Free, no key. PRIMARY free source.
 *
 *   National: https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-{senate|governor|house}.json
 *   Per state: https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-{state-name}.json
 *              (e.g. results-new-hampshire.json). These carry every statewide contest:
 *              attorney general, secretary of state, ballot measures, and more.
 *
 * These are the public JSON files behind nytimes.com's results pages, served
 * from a CDN. They are unofficial and undocumented: the format can change and
 * the publisher's terms apply. Fine for a personal dashboard; ask permission
 * before building anything commercial on them.
 *
 * Schema (cross-checked against several independent open-source trackers):
 *   { races: [{ nyt_id, office, office_id ("S"|"G"|"H"|"I"|…), race_type_id ("G" = general),
 *     seat, seat_number, coverage?, updated_at,
 *     candidate_metadata: { [id]: { first_name, last_name, incumbent, party: { nyt_id: "DEM"|"GOP"|… } } },
 *     outcome: { won: [id], advanced_to_runoff: [id], winner_accepted_at: [iso] },
 *     top_reporting_unit: { state_postal, eevp, total_votes, provider_updated_at,
 *                           candidates: [{ nyt_id, votes: { total } }] } }] }
 */
import { finalizeRace } from "../analysis";
import { ELECTION_DATE } from "../config";
import { APPORTIONMENT, districtLabel, raceId } from "../roster";
import type { Candidate, OfficeCode, Race } from "../types";
import { STATES } from "@/data/states";
import { fetchJson, mapLimit, partyFromLabel } from "./http";
import { ProviderError, type Provider } from "./types";

export const NYT_BASE = `https://static01.nyt.com/elections-assets/pages/data/${ELECTION_DATE}`;

interface NytCandidateMeta {
  nyt_id: string;
  first_name?: string | null;
  last_name?: string | null;
  incumbent?: boolean;
  party?: { nyt_id?: string; name?: string; abbreviation?: string } | null;
}

interface NytReportingUnit {
  state_postal?: string;
  level?: string;
  eevp?: number | null;
  total_votes?: number;
  precincts_reporting?: number | null;
  precincts_total?: number | null;
  provider_updated_at?: string | null;
  candidates?: { nyt_id: string; votes?: { total?: number } }[];
}

export interface NytRace {
  nyt_id?: string;
  office?: string;
  office_id?: string;
  race_type_id?: string;
  seat?: string | null;
  seat_number?: string | null;
  coverage?: string;
  updated_at?: string | null;
  candidate_metadata?: Record<string, NytCandidateMeta>;
  outcome?: {
    won?: string[];
    advanced_to_runoff?: string[];
    winner_accepted_at?: (string | null)[] | null;
  } | null;
  top_reporting_unit?: NytReportingUnit;
}

export interface NytFile {
  races?: NytRace[];
}

/** "AL" → "alabama", "NH" → "new-hampshire" (NYT's per-state file slugs). */
export function nytStateSlug(postal: string): string | null {
  const name = STATES.find((s) => s.postal === postal)?.name;
  return name ? name.toLowerCase().replace(/[^a-z]+/g, "-") : null;
}

function officeCode(id: string | undefined): OfficeCode {
  return id === "S" || id === "G" || id === "H" ? id : "X";
}

/** Translate one NYT race. Exported for unit tests. */
export function normalizeNytRace(r: NytRace, roster: Map<string, Race>): Race | null {
  const ru = r.top_reporting_unit;
  const state = ru?.state_postal;
  if (!ru || !state || state === "US") return null; // "US" = national popular-vote aggregate
  if (r.coverage && r.coverage !== "state") return null; // skip county/city contests

  const office = officeCode(r.office_id);
  const isBallotMeasure = r.office_id === "I";
  let id: string;
  let district: number | undefined;
  if (office === "H") {
    district = APPORTIONMENT[state] === 1 ? 0 : Number.parseInt(r.seat_number ?? "", 10);
    if (!Number.isFinite(district)) return null;
    id = raceId("H", state, district);
  } else if (office === "S" || office === "G") {
    id = raceId(office, state);
  } else {
    id = `X-${state}-${(r.nyt_id ?? `${r.office}-${r.seat}`).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  const won = new Set(r.outcome?.won ?? []);
  const runoff = new Set(r.outcome?.advanced_to_runoff ?? []);
  const votes = new Map((ru.candidates ?? []).map((c) => [c.nyt_id, c.votes?.total ?? 0]));
  const candidates: Candidate[] = Object.values(r.candidate_metadata ?? {}).map((m) => {
    const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.nyt_id;
    return {
      id: m.nyt_id,
      name,
      party: isBallotMeasure ? "I" : partyFromLabel(m.party?.nyt_id ?? m.party?.abbreviation),
      partyLabel: isBallotMeasure ? name : (m.party?.abbreviation ?? m.party?.name ?? m.party?.nyt_id ?? ""),
      votes: votes.get(m.nyt_id) ?? 0,
      pct: 0,
      incumbent: m.incumbent || undefined,
      winner: won.has(m.nyt_id) || undefined,
      runoff: runoff.has(m.nyt_id) || undefined,
    };
  });

  const base = roster.get(id);
  const officeName = r.office ?? base?.officeName ?? "Race";
  const calledAt = (r.outcome?.winner_accepted_at ?? []).find((x): x is string => !!x) ?? null;

  return finalizeRace({
    id,
    state,
    office,
    officeName,
    title: base?.title ?? (office === "H" ? districtLabel(state, district!) : r.seat || officeName),
    subtitle: base?.subtitle ?? (office === "X" && r.seat && r.seat !== officeName ? officeName : undefined),
    district,
    special: base?.special ?? (r.race_type_id !== undefined && r.race_type_id !== "G"),
    isBallotMeasure: isBallotMeasure || undefined,
    heldBy: base?.heldBy ?? null,
    holder: base?.holder,
    candidates,
    totalVotes: 0,
    reportingPct: ru.eevp == null ? null : Math.min(100, Math.max(0, ru.eevp)),
    status: "awaiting",
    winnerParty: null,
    calledAt,
    calledBy: won.size > 0 ? "AP" : undefined,
    lastUpdated: ru.provider_updated_at ?? r.updated_at ?? null,
    source: "nyt",
    pollClose: base?.pollClose,
    note: base?.note,
    newLines: base?.newLines,
  });
}

/** Normalize a whole file; when a seat appears twice, prefer the general election. */
export function normalizeNytFile(file: NytFile, roster: Map<string, Race>, keep: (r: Race) => boolean): Race[] {
  const byId = new Map<string, { race: Race; general: boolean }>();
  for (const raw of file.races ?? []) {
    const race = normalizeNytRace(raw, roster);
    if (!race || !keep(race)) continue;
    const general = raw.race_type_id === "G";
    const prev = byId.get(race.id);
    if (!prev || (general && !prev.general)) byId.set(race.id, { race, general });
  }
  return [...byId.values()].map((x) => x.race);
}

// Per-state files that failed this round keep their last good races.
const g = globalThis as typeof globalThis & { __nytStateCache?: Map<string, Race[]> };
const stateCache: Map<string, Race[]> = (g.__nytStateCache ??= new Map());

export const nytProvider: Provider = {
  id: "nyt",
  name: "AP via The New York Times",
  url: "https://www.nytimes.com/interactive/2026/11/03/us/elections/results.html",

  async fetchRaces({ config, roster, signal }) {
    const byId = new Map(roster.map((r) => [r.id, r]));

    // 1) The three national files (Senate, Governor, House) — the core results.
    const nationalP = Promise.allSettled(
      (["senate", "governor", "house"] as const).map(async (slug) => {
        const { data } = await fetchJson<NytFile>(`${NYT_BASE}/results-${slug}.json`, signal);
        return normalizeNytFile(data, byId, (r) => r.office !== "X");
      }),
    );

    // 2) Per-state files, fetched at the same time: every other statewide
    //    contest and ballot measure. Each state fails independently.
    const statesP = config.nytStateFiles
      ? mapLimit(STATES.map((s) => s.postal), 8, async (postal) => {
          const slug = nytStateSlug(postal);
          if (!slug) return;
          try {
            const { data } = await fetchJson<NytFile>(`${NYT_BASE}/results-${slug}.json`, signal);
            stateCache.set(postal, normalizeNytFile(data, byId, (r) => r.office === "X" && r.state === postal));
          } catch {
            // 404 (not published yet) or a hiccup: keep whatever we had for this state.
          }
        })
      : Promise.resolve();

    const [national] = await Promise.all([nationalP, statesP]);
    const failures = national.filter((r) => r.status === "rejected");
    if (failures.length === national.length) {
      const reason = (failures[0] as PromiseRejectedResult).reason;
      throw new ProviderError(reason instanceof Error ? reason.message : "NYT files unavailable");
    }
    const races = national.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (config.nytStateFiles) for (const list of stateCache.values()) races.push(...list);

    if (failures.length > 0) {
      // Partial data is still useful, but let the status panel know.
      console.warn(`[nyt] ${failures.length} of 3 national files failed this round`);
    }
    return races;
  },
};
