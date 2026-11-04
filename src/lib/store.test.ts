import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeRace } from "./analysis";
import { buildRoster } from "./roster";
import { computeTallies, getSnapshot, mergeRaces } from "./store";
import type { Race } from "./types";

const roster = buildRoster();

function live(id: string, source: string, dVotes: number, rVotes: number): Race {
  const base = roster.find((r) => r.id === id)!;
  return finalizeRace({
    ...base,
    heldBy: null,
    source,
    candidates: [
      { id: "d", name: "D", party: "D", partyLabel: "Dem", votes: dVotes, pct: 0 },
      { id: "r", name: "R", party: "R", partyLabel: "GOP", votes: rVotes, pct: 0 },
    ],
  });
}

describe("roster", () => {
  it("covers every federal and gubernatorial race on the 2026 ballot", () => {
    expect(roster.filter((r) => r.office === "S")).toHaveLength(35);
    expect(roster.filter((r) => r.office === "G")).toHaveLength(36);
    expect(roster.filter((r) => r.office === "H")).toHaveLength(435);
    expect(new Set(roster.map((r) => r.id)).size).toBe(roster.length);
    expect(roster.find((r) => r.id === "S-OH")?.special).toBe(true);
    expect(roster.every((r) => r.pollClose)).toBe(true);
  });

  it("knows who holds every seat (vacancies resolved to the prior party)", () => {
    expect(roster.filter((r) => r.office !== "X" && !r.heldBy)).toEqual([]);
  });
});

describe("mergeRaces", () => {
  it("prefers the most trusted provider that has data, keeping roster metadata", () => {
    const merged = mergeRaces(roster, [
      [live("S-GA", "primary", 0, 0)], // trusted but empty
      [live("S-GA", "secondary", 10, 5)],
    ]);
    const ga = merged.find((r) => r.id === "S-GA")!;
    expect(ga.source).toBe("secondary");
    expect(ga.heldBy).toBe(roster.find((r) => r.id === "S-GA")!.heldBy);
    expect(merged).toHaveLength(roster.length);

    const both = mergeRaces(roster, [[live("S-GA", "primary", 1, 2)], [live("S-GA", "secondary", 10, 5)]]);
    expect(both.find((r) => r.id === "S-GA")!.source).toBe("primary");
  });

  it("adds races the roster doesn't know about", () => {
    const extra: Race = { ...live("S-GA", "x", 1, 1), id: "X-GA-1", office: "X" };
    expect(mergeRaces(roster, [[extra]])).toHaveLength(roster.length + 1);
  });
});

describe("computeTallies", () => {
  it("counts holdovers so totals add up to each body's size", () => {
    const t = computeTallies(roster, new Set(roster.map((r) => r.id)));
    const sum = (c: typeof t.senate) =>
      (["D", "R", "I"] as const).reduce((s, p) => s + c[p].holdover + c[p].won + c[p].leading, 0) + c.awaiting;
    expect(sum(t.senate)).toBe(100);
    expect(sum(t.house)).toBe(435);
    expect(sum(t.governors)).toBe(50);
  });
});

describe("getSnapshot cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T02:00:00Z"));
    vi.stubEnv("DATA_PROVIDERS", "demo");
    vi.stubEnv("REFRESH_INTERVAL_SECONDS", "300");
    vi.stubEnv("MIN_FORCED_REFRESH_SECONDS", "20");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("serves from cache within the TTL, throttles forced refreshes, then refreshes", async () => {
    const first = await getSnapshot();
    expect(first.simulated).toBe(true);
    expect(await getSnapshot()).toBe(first);

    vi.advanceTimersByTime(5_000);
    expect(await getSnapshot({ force: true })).toBe(first); // throttled

    vi.advanceTimersByTime(30_000);
    const forced = await getSnapshot({ force: true });
    expect(forced).not.toBe(first);

    vi.advanceTimersByTime(301_000);
    const expired = await getSnapshot();
    expect(expired).not.toBe(forced);
    expect(Date.parse(expired.nextRefreshAt) - Date.parse(expired.fetchedAt)).toBe(300_000);
  });
});
