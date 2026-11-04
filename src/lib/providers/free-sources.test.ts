import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoster } from "../roster";
import { adoptCall, getLocalRaces, getSnapshot, mergeRaces, resetStoreForTests } from "../store";
import { normalizeCnnFile, type CnnRace } from "./cnn";
import { partyFromLabel } from "./http";
import { normalizeNytFile, nytStateSlug, type NytFile } from "./nyt";

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8")) as T;

const rosterList = buildRoster();
const roster = new Map(rosterList.map((r) => [r.id, r]));

describe("party labels", () => {
  it("accepts every variant outlets use", () => {
    for (const d of ["DEM", "dem", "Democrat", "democratic", "DFL"]) expect(partyFromLabel(d)).toBe("D");
    for (const r of ["GOP", "REP", "Republican", "rep"]) expect(partyFromLabel(r)).toBe("R");
    for (const i of ["LIB", "GRN", "IND", "", null, undefined]) expect(partyFromLabel(i)).toBe("I");
  });
});

describe("NYT provider", () => {
  const senate = normalizeNytFile(fixture<NytFile>("nyt-results-senate.json"), roster, (r) => r.office !== "X");

  it("normalizes a counting Senate race", () => {
    const ga = senate.find((r) => r.id === "S-GA")!;
    expect(ga.status).toBe("counting");
    expect(ga.reportingPct).toBe(60);
    expect(ga.lastUpdated).toBe("2026-11-04T01:28:30Z");
    expect(ga.candidates.map((c) => [c.name, c.party])).toEqual([["Jon Ossoff", "D"], ["Pat Example", "R"]]);
    expect(ga.heldBy).toBe(roster.get("S-GA")!.heldBy);
  });

  it("reads calls (winner_accepted_at) and mixed party spellings", () => {
    const oh = senate.find((r) => r.id === "S-OH")!;
    expect(oh.status).toBe("called");
    expect(oh.winnerParty).toBe("R");
    expect(oh.calledBy).toBe("AP");
    expect(oh.calledAt).toBe("2026-11-04T01:05:00Z");
    expect(oh.special).toBe(true);
    expect(oh.candidates.find((c) => c.name === "Bo Beta")!.party).toBe("D"); // "democrat"
  });

  it("skips the national aggregate row", () => {
    expect(senate.some((r) => r.state === "US")).toBe(false);
    expect(senate).toHaveLength(2);
  });

  it("keeps House races of every geographic coverage (regression: live files use multi-county/county)", () => {
    const house = normalizeNytFile(fixture<NytFile>("nyt-results-house.json"), roster, () => true);
    expect(house.map((r) => r.id).sort()).toEqual(["H-AK-0", "H-GA-14", "H-LA-2"]); // national aggregate dropped
    const la = house.find((r) => r.id === "H-LA-2")!;
    expect(la.special).toBeFalsy(); // Louisiana's "L" race type is a regular election
    expect(la.local).toBeFalsy();
  });

  it("maps at-large House seats and runoffs", () => {
    const house = normalizeNytFile(fixture<NytFile>("nyt-results-house.json"), roster, () => true);
    expect(house.find((r) => r.id === "H-AK-0")?.title).toBe("AK-AL");
    const ga14 = house.find((r) => r.id === "H-GA-14")!;
    expect(ga14.status).toBe("runoff");
    expect(ga14.candidates.filter((c) => c.runoff)).toHaveLength(2);
  });

  it("reads statewide offices, ballot measures and legislative districts from state files", () => {
    const fl = normalizeNytFile(fixture<NytFile>("nyt-results-florida.json"), roster, (r) => r.office === "X");
    expect(fl).toHaveLength(3);
    const measure = fl.find((r) => r.isBallotMeasure)!;
    expect(measure.title).toBe("Amendment 4 – Sample Amendment"); // NYT's curated title.default
    expect(measure.local).toBeFalsy();
    expect(measure.candidates.map((c) => c.name)).toEqual(["Yes", "No"]);
    expect(fl.find((r) => r.title === "Attorney General")?.candidates[0].party).toBe("R");
    const senate12 = fl.find((r) => r.officeName === "State Senate")!;
    expect(senate12.title).toBe("District 12");
    expect(senate12.local).toBe(true); // served per state, not in the main snapshot
    expect(senate12.status).toBe("called");
  });

  it("builds the per-state file slugs NYT uses", () => {
    expect(nytStateSlug("NH")).toBe("new-hampshire");
    expect(nytStateSlug("DC")).toBe("district-of-columbia");
  });
});

describe("CNN provider", () => {
  it("normalizes counting and called Senate races", () => {
    const sg = normalizeCnnFile(fixture<CnnRace[]>("cnn-national-2026-SG.json"), roster);
    const ga = sg.find((r) => r.id === "S-GA")!;
    expect(ga.status).toBe("counting");
    expect(ga.reportingPct).toBe(62);
    expect(ga.lastUpdated).toBe("2026-11-04T01:30:04.374157Z"); // extractedAt is UTC without a suffix
    const tx = sg.find((r) => r.id === "S-TX")!;
    expect(tx.status).toBe("called");
    expect(tx.calledBy).toBe("Decision Desk HQ");
    expect(tx.calledAt).toBe("2026-11-04T02:58:11.000Z");
    expect(tx.candidates.find((c) => c.name === "Lee Libertarian")!.party).toBe("I");
  });

  it("drops contests decided before election day and maps at-large seats", () => {
    const hg = normalizeCnnFile(fixture<CnnRace[]>("cnn-national-2026-HG.json"), roster);
    const tx18 = hg.find((r) => r.id === "H-TX-18")!;
    expect(tx18.status).toBe("counting"); // the January special runoff winner is ignored
    expect(tx18.candidates[0].name).toBe("Nov Candidate");
    expect(hg.find((r) => r.id === "H-WY-0")?.winnerParty).toBe("R");
  });
});

describe("combining sources", () => {
  const nytGa = normalizeNytFile(fixture<NytFile>("nyt-results-senate.json"), roster, () => true).find((r) => r.id === "S-GA")!;
  const cnnGa = normalizeCnnFile(fixture<CnnRace[]>("cnn-national-2026-SG.json"), roster).find((r) => r.id === "S-GA")!;
  const cnnCalled = {
    ...cnnGa,
    status: "called" as const,
    winnerParty: "D" as const,
    calledBy: "Decision Desk HQ",
    calledAt: "2026-11-04T03:00:00Z",
    candidates: cnnGa.candidates.map((c) => (c.party === "D" ? { ...c, winner: true } : c)),
  };

  it("adopts another source's call onto the matching candidate, keeping primary votes", () => {
    const merged = adoptCall(nytGa, cnnCalled);
    expect(merged.status).toBe("called");
    expect(merged.calledBy).toBe("Decision Desk HQ");
    expect(merged.totalVotes).toBe(nytGa.totalVotes);
    expect(merged.candidates.find((c) => c.winner)?.name).toBe("Jon Ossoff");
  });

  it("applies call union inside mergeRaces", () => {
    const out = mergeRaces(rosterList, [[nytGa], [cnnCalled]]);
    const ga = out.find((r) => r.id === "S-GA")!;
    expect(ga.source).toBe("nyt");
    expect(ga.status).toBe("called");
  });
});

describe("end-to-end pipeline with mocked network", () => {
  const files: Record<string, unknown> = {
    "results-senate.json": fixture("nyt-results-senate.json"),
    "results-house.json": fixture("nyt-results-house.json"),
    "results-governor.json": { races: [] },
    "results-florida.json": fixture("nyt-results-florida.json"),
    "2026-SG.json": fixture("cnn-national-2026-SG.json"),
    "2026-HG.json": fixture("cnn-national-2026-HG.json"),
    "2026-GG.json": [],
  };
  let nytDown = false;

  beforeEach(() => {
    resetStoreForTests();
    vi.stubEnv("DATA_PROVIDERS", "");
    vi.stubEnv("AP_API_KEY", "");
    vi.stubEnv("RESULTS_FEED_URL", "");
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      const name = url.split("/").at(-1)!;
      if (nytDown && url.includes("static01.nyt.com")) return new Response("down", { status: 503 });
      if (name in files) return Response.json(files[name]);
      return new Response("not found", { status: 404 });
    });
  });
  afterEach(() => {
    nytDown = false;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses NYT + CNN by default with no configuration", async () => {
    const snap = await getSnapshot({ force: true });
    expect(snap.rosterOnly).toBe(false);
    expect(snap.sources.map((s) => [s.id, s.ok])).toEqual([["nyt", true], ["cnn", true]]);
    const byId = new Map(snap.races.map((r) => [r.id, r]));
    expect(byId.get("S-GA")!.source).toBe("nyt"); // primary wins when both have data
    expect(byId.get("S-TX")!.source).toBe("cnn"); // CNN fills races NYT lacks
    expect(byId.get("S-TX")!.calledBy).toBe("Decision Desk HQ");
    expect(snap.races.some((r) => r.isBallotMeasure && r.state === "FL")).toBe(true);
    expect(snap.races.some((r) => r.local)).toBe(false); // legislative races stay out of the snapshot
    const fl = await getLocalRaces("FL");
    expect(fl.races.map((r) => r.title)).toEqual(["District 12"]);
    expect(snap.tallies.senate.R.won).toBeGreaterThanOrEqual(2); // OH (AP) + TX (DDHQ)
  });

  it("fails over to CNN when NYT is down", async () => {
    nytDown = true;
    const snap = await getSnapshot({ force: true });
    const nyt = snap.sources.find((s) => s.id === "nyt")!;
    expect(nyt.ok).toBe(false);
    expect(nyt.error).toContain("503");
    expect(snap.races.find((r) => r.id === "S-GA")!.source).toBe("cnn");
  });
});
