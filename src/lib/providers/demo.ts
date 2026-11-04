/**
 * SIMULATED results — a development tool, never real data.
 *
 * Enable with DATA_PROVIDERS=demo. It replays a fictional election night on an
 * accelerated "virtual clock" that starts at DEMO_START (default 18:45 ET) when
 * the server boots and runs DEMO_SPEED× faster than real time (default 12×,
 * so the whole night plays out in under an hour). Each state starts counting at its real
 * poll-closing time, early returns drift ("red/blue mirage"), and races get
 * called once the lead is safe — enough to exercise every UI state.
 *
 * Candidates are deliberately generic ("Democratic candidate") so simulated
 * numbers can never be mistaken for a real person's result, and the UI shows a
 * persistent SIMULATED banner whenever this provider is active.
 */
import { finalizeRace } from "../analysis";
import { pollCloseIso } from "../roster";
import type { Candidate, PartyCode, Race } from "../types";
import type { Provider } from "./types";
const SLOW_COUNT_STATES = new Set(["AK", "AZ", "CA", "NV", "OR", "UT", "WA"]);

interface DemoState {
  bootedAt: number;
  calledAt: Map<string, string>;
}
const g = globalThis as typeof globalThis & { __demoState?: DemoState };
const demo: DemoState = (g.__demoState ??= { bootedAt: Date.now(), calledAt: new Map() });

/** Virtual election-night clock: starts at `start` (ET) when the server boots. */
export function virtualNow(now: Date, speed: number, start = "18:45"): number {
  return Date.parse(pollCloseIso(start)) + (now.getTime() - demo.bootedAt) * speed;
}

/** Small deterministic PRNG so each race gets a stable personality. */
function seeded(key: string): () => number {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const NATIONAL_SWING = 2.5; // points toward D; midterms usually cut against the president's party

function simulate(race: Race, vt: number, nowIso: string): Race {
  if (!race.pollClose || vt < Date.parse(race.pollClose)) return race;
  const close = Date.parse(race.pollClose);

  const rnd = seeded(race.id);
  const stateRnd = seeded(race.state);
  const tau = SLOW_COUNT_STATES.has(race.state) ? 3.2 : 1.4; // hours to ~63% counted
  const hours = (vt - close) / 3_600_000;
  const reporting = Math.min(99.5, 100 * (1 - Math.exp(-hours / tau)));

  // Final D-minus-R margin in points: seat lean + national + state + race noise.
  const lean = race.heldBy === "D" ? 4 + rnd() * 26 : race.heldBy === "R" ? -(4 + rnd() * 26) : (rnd() - 0.5) * 20;
  const finalMargin = lean + NATIONAL_SWING + (stateRnd() - 0.5) * 6 + (rnd() - 0.5) * 10;
  // Early-count drift that fades as the count completes.
  const drift = (rnd() - 0.5) * 16 * (1 - reporting / 100);
  const margin = finalMargin + drift;
  const otherShare = race.isBallotMeasure ? 0 : 1 + rnd() * 3;

  const expected = race.office === "H" ? 220_000 + rnd() * 140_000 : 600_000 + rnd() * 5_000_000;
  const counted = Math.round((expected * reporting) / 100);

  const shares: [string, PartyCode, number][] = race.isBallotMeasure
    ? [["Yes", "I", 50 + margin / 2], ["No", "I", 50 - margin / 2]]
    : [
        ["Democratic candidate", "D", 50 + margin / 2 - otherShare / 2],
        ["Republican candidate", "R", 50 - margin / 2 - otherShare / 2],
        ["Independent candidate", "I", otherShare],
      ];

  const absMargin = Math.abs(margin);
  const safe =
    (reporting >= 5 && absMargin >= 22) ||
    (reporting >= 40 && absMargin >= 9) ||
    (reporting >= 75 && absMargin >= 3.5) ||
    (reporting >= 97 && absMargin >= 0.6);
  if (safe && !demo.calledAt.has(race.id)) demo.calledAt.set(race.id, nowIso);
  const isCalled = demo.calledAt.has(race.id);
  const leaderIdx = shares.reduce((best, s, i) => (s[2] > shares[best][2] ? i : best), 0);
  // Georgia requires a majority: a sub-50% leader in a finished count goes to a runoff.
  const needsRunoff = race.state === "GA" && !race.isBallotMeasure && reporting >= 99 && shares[leaderIdx][2] < 50;

  const candidates: Candidate[] = shares.map(([name, party, share], i) => ({
    id: `${race.id}-${i}`,
    name,
    party,
    partyLabel: race.isBallotMeasure ? name : party === "D" ? "Dem" : party === "R" ? "GOP" : "Ind",
    votes: Math.max(0, Math.round((counted * share) / 100)),
    pct: 0,
    winner: (isCalled && !needsRunoff && i === leaderIdx) || undefined,
    runoff: (needsRunoff && i <= 1) || undefined,
  }));

  return finalizeRace({
    ...race,
    candidates,
    reportingPct: Math.round(reporting * 10) / 10,
    calledAt: demo.calledAt.get(race.id) ?? null,
    lastUpdated: nowIso,
    source: "demo",
  });
}

/** A handful of simulated ballot measures so the "other races" UI has content. */
function sampleMeasures(roster: Race[]): Race[] {
  return ["CA", "FL", "MO", "NV", "OH", "MI"].map((state) => {
    const ref = roster.find((r) => r.state === state && r.office === "H");
    return {
      id: `X-${state}-demo-measure`,
      state,
      office: "X" as const,
      officeName: "Ballot measure",
      title: "Statewide Measure 1",
      subtitle: "Simulated ballot question",
      isBallotMeasure: true,
      heldBy: null,
      candidates: [],
      totalVotes: 0,
      reportingPct: null,
      status: "awaiting" as const,
      winnerParty: null,
      calledAt: null,
      lastUpdated: null,
      source: "demo",
      pollClose: ref?.pollClose,
    };
  });
}

export const demoProvider: Provider = {
  id: "demo",
  name: "Simulator",
  simulated: true,

  async fetchRaces({ config, roster, now }) {
    const vt = virtualNow(now, config.demoSpeed, config.demoStart);
    const nowIso = now.toISOString();
    return [...roster, ...sampleMeasures(roster)].map((r) => simulate(r, vt, nowIso));
  },
};
