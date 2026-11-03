import { describe, expect, it } from "vitest";
import { buildRoster } from "../roster";
import { apParty, normalizeApRace, type ApRace } from "./ap";
import { feedParty, normalizeFeedRace } from "./feed";

const roster = new Map(buildRoster().map((r) => [r.id, r]));

describe("AP provider", () => {
  it("maps party abbreviations to display buckets", () => {
    expect(apParty("Dem")).toBe("D");
    expect(apParty("DFL")).toBe("D");
    expect(apParty("GOP")).toBe("R");
    expect(apParty("Lib")).toBe("I");
    expect(apParty(undefined)).toBe("I");
  });

  it("normalizes a Senate race with a winner and keeps roster metadata", () => {
    const ap: ApRace = {
      raceID: "11000",
      officeID: "S",
      officeName: "U.S. Senate",
      reportingUnits: [
        {
          level: "state",
          statePostal: "GA",
          lastUpdated: "2026-11-04T03:12:00Z",
          eevp: 88,
          candidates: [
            { candidateID: "1", first: "Pat", last: "Doe", party: "Dem", voteCount: 1_900_000, winner: "X", winnerDateTime: "2026-11-04T03:10:00Z", incumbent: true },
            { candidateID: "2", first: "Sam", last: "Roe", party: "GOP", voteCount: 1_700_000 },
          ],
        },
      ],
    };
    const r = normalizeApRace(ap, roster)!;
    expect(r.id).toBe("S-GA");
    expect(r.status).toBe("called");
    expect(r.winnerParty).toBe("D");
    expect(r.calledAt).toBe("2026-11-04T03:10:00Z");
    expect(r.reportingPct).toBe(88);
    expect(r.heldBy).toBe(roster.get("S-GA")!.heldBy);
    expect(r.candidates[0].name).toBe("Pat Doe");
    expect(r.candidates[0].incumbent).toBe(true);
  });

  it("maps House districts, at-large seats, and precinct-based reporting", () => {
    const district = normalizeApRace(
      { raceID: "2", officeID: "H", seatNum: "14", reportingUnits: [{ level: "state", statePostal: "GA", precinctsReporting: 50, precinctsTotal: 200, candidates: [] }] },
      roster,
    )!;
    expect(district.id).toBe("H-GA-14");
    expect(district.title).toBe("GA-14");
    expect(district.reportingPct).toBe(25);

    const atLarge = normalizeApRace(
      { raceID: "3", officeID: "H", seatNum: "1", reportingUnits: [{ level: "state", statePostal: "WY", candidates: [] }] },
      roster,
    )!;
    expect(atLarge.id).toBe("H-WY-0");
    expect(atLarge.title).toBe("WY-AL");
  });

  it("treats a retracted call (winner = N) as uncalled and R as runoff", () => {
    const base = { raceID: "4", officeID: "G", reportingUnits: [{ level: "state", statePostal: "GA" }] } as ApRace;
    const retracted = normalizeApRace(
      { ...base, reportingUnits: [{ ...base.reportingUnits![0], candidates: [{ first: "A", party: "GOP", voteCount: 10, winner: "N" }, { first: "B", party: "Dem", voteCount: 9 }] }] },
      roster,
    )!;
    expect(retracted.status).toBe("counting");
    const runoff = normalizeApRace(
      { ...base, reportingUnits: [{ ...base.reportingUnits![0], candidates: [{ first: "A", party: "GOP", voteCount: 49, winner: "R" }, { first: "B", party: "Dem", voteCount: 48, winner: "R" }] }] },
      roster,
    )!;
    expect(runoff.status).toBe("runoff");
  });

  it("keeps other offices and ballot measures as X races", () => {
    const m = normalizeApRace(
      { raceID: "77", officeID: "I", officeName: "Ballot Measure", seatName: "Amendment 1", description: "Sample", reportingUnits: [{ level: "state", statePostal: "FL", candidates: [{ first: "Yes", voteCount: 6 }, { first: "No", voteCount: 4 }] }] },
      roster,
    )!;
    expect(m.id).toBe("X-FL-77");
    expect(m.isBallotMeasure).toBe(true);
    expect(m.title).toBe("Amendment 1");
    expect(m.candidates.every((c) => c.party === "I")).toBe(true);
  });
});

describe("feed provider", () => {
  it("normalizes valid entries and rejects malformed ones", () => {
    const ok = normalizeFeedRace(
      { state: "pa", office: "h", district: 7, reportingPct: 120, candidates: [{ name: "A", party: "Democratic", votes: 10 }, { name: "B", party: "GOP", votes: 5.4 }] },
      roster,
      "2026-11-04T02:00:00Z",
    )!;
    expect(ok.id).toBe("H-PA-7");
    expect(ok.reportingPct).toBe(100);
    expect(ok.lastUpdated).toBe("2026-11-04T02:00:00Z");
    expect(ok.candidates.map((c) => c.party)).toEqual(["D", "R"]);
    expect(normalizeFeedRace({ state: "PA", office: "H", candidates: [] }, roster, null)).toBeNull();
    expect(normalizeFeedRace({ state: "PA", office: "Z", candidates: [] }, roster, null)).toBeNull();
  });

  it("maps free-form party labels", () => {
    expect(feedParty("Republican")).toBe("R");
    expect(feedParty("dem")).toBe("D");
    expect(feedParty("Green")).toBe("I");
  });
});
