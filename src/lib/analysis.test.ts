import { describe, expect, it } from "vitest";
import { finalizeRace, flipState, leadingParty, marginPts, tallyChamber } from "./analysis";
import type { Candidate, PartyCode, Race } from "./types";

function cand(name: string, party: PartyCode, votes: number, extra: Partial<Candidate> = {}): Candidate {
  return { id: name, name, party, partyLabel: party, votes, pct: 0, ...extra };
}

function race(candidates: Candidate[], extra: Partial<Race> = {}): Race {
  return finalizeRace({
    id: "S-XX",
    state: "XX",
    office: "S",
    officeName: "U.S. Senate",
    title: "Senate",
    heldBy: "R",
    candidates,
    totalVotes: 0,
    reportingPct: 50,
    status: "awaiting",
    winnerParty: null,
    calledAt: null,
    lastUpdated: "2026-11-04T02:00:00Z",
    source: "test",
    ...extra,
  });
}

describe("finalizeRace", () => {
  it("computes shares, sorts by votes, and derives status", () => {
    const r = race([cand("A", "R", 400), cand("B", "D", 600)]);
    expect(r.totalVotes).toBe(1000);
    expect(r.candidates.map((c) => c.name)).toEqual(["B", "A"]);
    expect(r.candidates[0].pct).toBeCloseTo(60);
    expect(r.status).toBe("counting");
    expect(marginPts(r)).toBeCloseTo(20);
  });

  it("is awaiting with no votes and called when a winner is flagged", () => {
    expect(race([cand("A", "R", 0), cand("B", "D", 0)]).status).toBe("awaiting");
    const called = race([cand("A", "R", 10, { winner: true }), cand("B", "D", 5)]);
    expect(called.status).toBe("called");
    expect(called.winnerParty).toBe("R");
    expect(called.calledAt).toBe("2026-11-04T02:00:00Z");
  });

  it("recognizes runoffs", () => {
    const r = race([cand("A", "R", 49, { runoff: true }), cand("B", "D", 48, { runoff: true }), cand("C", "I", 3)]);
    expect(r.status).toBe("runoff");
    expect(leadingParty(r)).toBe("R");
  });
});

describe("flipState", () => {
  it("flags a called race won by a different party as flipped", () => {
    expect(flipState(race([cand("A", "D", 60, { winner: true }), cand("B", "R", 40)]))).toBe("flipped");
  });

  it("does not flag a hold", () => {
    expect(flipState(race([cand("A", "R", 60, { winner: true }), cand("B", "D", 40)]))).toBeNull();
  });

  it("flags a challenger-party lead as trending", () => {
    expect(flipState(race([cand("A", "D", 520), cand("B", "R", 480)]))).toBe("trending");
  });

  it("flags a narrow holding-party lead as at-risk", () => {
    expect(flipState(race([cand("A", "R", 505), cand("B", "D", 495)]))).toBe("at-risk");
    expect(flipState(race([cand("A", "R", 600), cand("B", "D", 400)]))).toBeNull();
  });

  it("never flags a same-party top-two race", () => {
    expect(flipState(race([cand("A", "R", 505), cand("B", "R", 495)]))).toBeNull();
  });

  it("does not treat an incumbent who changed party labels as a flip", () => {
    expect(flipState(race([cand("Inc", "I", 600, { incumbent: true, winner: true }), cand("B", "D", 400)]))).toBeNull();
  });

  it("ignores ballot measures and seats with unknown holders", () => {
    expect(flipState(race([cand("Yes", "I", 6), cand("No", "I", 4)], { isBallotMeasure: true }))).toBeNull();
    expect(flipState(race([cand("A", "D", 6), cand("B", "R", 4)], { heldBy: null }))).toBeNull();
  });
});

describe("tallyChamber", () => {
  it("splits won / leading / awaiting and keeps holdovers", () => {
    const races = [
      race([cand("A", "D", 60, { winner: true }), cand("B", "R", 40)]),
      race([cand("A", "R", 60), cand("B", "D", 40)]),
      race([cand("A", "R", 0), cand("B", "D", 0)]),
    ];
    const t = tallyChamber(races, { total: 100, majority: 51, holdovers: { D: 30, R: 37 } });
    expect(t.D).toEqual({ won: 1, leading: 0, holdover: 30 });
    expect(t.R).toEqual({ won: 0, leading: 1, holdover: 37 });
    expect(t.awaiting).toBe(1);
    expect(t.up).toBe(3);
  });
});
