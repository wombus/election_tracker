import { describe, expect, it } from "vitest";
import { finalizeRace } from "./analysis";
import { houseFill, mapFills } from "./map-fills";
import { buildRoster } from "./roster";
import type { PartyCode, Race } from "./types";

const roster = buildRoster();

function withVotes(id: string, d: number, r: number, winner?: PartyCode): Race {
  const base = roster.find((x) => x.id === id)!;
  return finalizeRace({
    ...base,
    candidates: [
      { id: "d", name: "D", party: "D", partyLabel: "Dem", votes: d, pct: 0, winner: winner === "D" || undefined },
      { id: "r", name: "R", party: "R", partyLabel: "GOP", votes: r, pct: 0, winner: winner === "R" || undefined },
    ],
  });
}

describe("mapFills (Senate / Governor)", () => {
  it("colors called, leading, awaiting and no-race states differently", () => {
    const races = roster.map((r) =>
      r.id === "S-GA" ? withVotes("S-GA", 60, 40, "D") : r.id === "S-NC" ? withVotes("S-NC", 40, 60) : r,
    );
    const fills = mapFills(races, "S");
    expect(fills.GA.fill).toBe("D");
    expect(fills.NC.fill).toBe("R-lean");
    expect(fills.TX.fill).toBe("pending");
    expect(fills.CA.fill).toBe("none"); // no Senate race in California in 2026
    expect(fills.NC.summary[0]).toContain("leads");
  });
});

describe("houseFill", () => {
  const seats = (ids: string[], f: (id: string) => Race) => ids.map(f);
  it("bins by share of seats won or led", () => {
    const ny = roster.filter((r) => r.state === "NY" && r.office === "H").map((r) => r.id);
    expect(houseFill(seats(ny, (id) => withVotes(id, 60, 40))).fill).toBe("D");
    expect(houseFill(seats(ny, (id) => withVotes(id, 40, 60))).fill).toBe("R");
    const half = seats(ny, (id) => (Number(id.split("-")[2]) % 2 ? withVotes(id, 60, 40) : withVotes(id, 40, 60)));
    expect(houseFill(half).fill).toBe("I-lean");
    expect(houseFill(roster.filter((r) => r.state === "NY" && r.office === "H")).fill).toBe("pending");
  });
});
