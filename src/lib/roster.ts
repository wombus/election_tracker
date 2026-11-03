/**
 * The roster: every federal and gubernatorial race on the ballot tonight,
 * with who holds each seat now. It exists independently of any live source so
 * that (a) the map is complete before a single vote is counted, and (b) we know
 * the "held by" party needed to tell a hold from a flip.
 */
import congress from "@/data/congress.json";
import { REDISTRICTED_2026, STATES, STATE_BY_POSTAL } from "@/data/states";
import { ELECTION_DATE } from "./config";
import type { PartyCode, Race } from "./types";

interface CongressData {
  apportionment: Record<string, number>;
  senate: { state: string; class: number; party: PartyCode; caucus: PartyCode; name: string; upIn2026: boolean; special: boolean }[];
  house: { state: string; district: number; party: PartyCode; caucus: PartyCode; name: string }[];
  vacancies: { state: string; district: number; priorParty?: PartyCode; priorName?: string; vacatedOn?: string }[];
}

const data = congress as CongressData;

export const APPORTIONMENT = data.apportionment;
export const SENATORS = data.senate;

/** "20:30" on election night (ET) → ISO timestamp. Nov 3, 2026 is in EST (UTC−5). */
export function pollCloseIso(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = ELECTION_DATE.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 5, m)).toISOString();
}

export function raceId(office: "S" | "G", state: string): string;
export function raceId(office: "H", state: string, district: number): string;
export function raceId(office: "S" | "G" | "H", state: string, district?: number): string {
  return office === "H" ? `H-${state}-${district}` : `${office}-${state}`;
}

/** "GA-14", or "AK-AL" for at-large seats. */
export function districtLabel(state: string, district: number): string {
  return district === 0 ? `${state}-AL` : `${state}-${district}`;
}

function emptyRace(partial: Omit<Race, "candidates" | "totalVotes" | "reportingPct" | "status" | "winnerParty" | "calledAt" | "lastUpdated" | "source">): Race {
  return {
    ...partial,
    candidates: [],
    totalVotes: 0,
    reportingPct: null,
    status: "awaiting",
    winnerParty: null,
    calledAt: null,
    lastUpdated: null,
    source: "roster",
  };
}

let cached: Race[] | null = null;

export function buildRoster(): Race[] {
  if (cached) return cached;
  const races: Race[] = [];

  for (const sen of data.senate) {
    if (!sen.upIn2026) continue;
    const st = STATE_BY_POSTAL[sen.state];
    races.push(
      emptyRace({
        id: raceId("S", sen.state),
        state: sen.state,
        office: "S",
        officeName: "U.S. Senate",
        title: "Senate",
        subtitle: sen.special ? "Special election" : undefined,
        special: sen.special,
        heldBy: sen.party,
        holder: sen.name,
        pollClose: pollCloseIso(st.pollClose),
      }),
    );
  }

  for (const st of STATES) {
    if (!st.governor?.upIn2026) continue;
    races.push(
      emptyRace({
        id: raceId("G", st.postal),
        state: st.postal,
        office: "G",
        officeName: "Governor",
        title: "Governor",
        heldBy: st.governor.party,
        holder: st.governor.name,
        pollClose: pollCloseIso(st.pollClose),
      }),
    );
  }

  const members = new Map(data.house.map((m) => [`${m.state}-${m.district}`, m]));
  const vacancies = new Map(data.vacancies.map((v) => [`${v.state}-${v.district}`, v]));

  for (const [state, seats] of Object.entries(data.apportionment)) {
    const st = STATE_BY_POSTAL[state];
    const districts = seats === 1 ? [0] : Array.from({ length: seats }, (_, i) => i + 1);
    for (const district of districts) {
      const key = `${state}-${district}`;
      const member = members.get(key);
      const vacancy = vacancies.get(key);
      races.push(
        emptyRace({
          id: raceId("H", state, district),
          state,
          office: "H",
          officeName: "U.S. House",
          title: districtLabel(state, district),
          district,
          heldBy: member?.party ?? vacancy?.priorParty ?? null,
          holder: member?.name ?? (vacancy ? "Vacant" : undefined),
          pollClose: pollCloseIso(st.pollClose),
          note: vacancy ? `Vacant since ${vacancy.vacatedOn ?? "2026"}; last held by ${vacancy.priorName ?? "unknown"}.` : undefined,
          newLines: REDISTRICTED_2026.has(state) || undefined,
        }),
      );
    }
  }

  cached = races;
  return races;
}
