#!/usr/bin/env node
/**
 * Builds src/data/congress.json — who currently holds every U.S. Senate and
 * House seat — from the public, community-maintained dataset at
 * https://github.com/unitedstates/congress-legislators.
 *
 * Why a build step instead of fetching at runtime?
 *   The roster changes rarely (a resignation here, a special election there),
 *   but every page view needs it. Generating a small committed JSON file keeps
 *   the app fast, deterministic, and working even if GitHub is unreachable.
 *   Re-run `npm run data:roster` whenever membership changes.
 *
 * Usage:
 *   node scripts/build-roster.mjs                 # download from GitHub
 *   node scripts/build-roster.mjs ./current.yaml ./historical.yaml  # local copies
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const BASE = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";
const SOURCE_URL = `${BASE}/legislators-current.yaml`;
const HISTORICAL_URL = `${BASE}/legislators-historical.yaml`;
const ELECTION_DATE = "2026-11-03";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/congress.json");

// House apportionment from the 2020 Census (fixed for the 2022–2030 elections).
const APPORTIONMENT = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};

/** Map the dataset's party names onto our three display buckets. */
function partyCode(name) {
  if (name === "Democrat") return "D";
  if (name === "Republican") return "R";
  return "I";
}

async function loadYaml(localPath, url) {
  if (localPath) return readFile(localPath, "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download of ${url} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

const total = Object.values(APPORTIONMENT).reduce((a, b) => a + b, 0);
if (total !== 435) throw new Error(`Apportionment sums to ${total}, expected 435`);

const people = parse(await loadYaml(process.argv[2], SOURCE_URL));
const senate = [];
const house = [];

for (const person of people) {
  const term = person.terms.at(-1); // the last term is the current one
  const name = person.name.official_full ?? `${person.name.first} ${person.name.last}`;
  const party = partyCode(term.party);
  const caucus = term.caucus ? partyCode(term.caucus) : party;

  if (term.type === "sen") {
    // A seat is on the ballot this year if it's a Class 2 seat (regular cycle)
    // or an appointee's seat whose term ends at a special election today.
    const special = term["end-type"] === "special-election" && term.end <= ELECTION_DATE;
    senate.push({
      state: term.state,
      class: term.class,
      party,
      caucus,
      name,
      upIn2026: term.class === 2 || special,
      special,
    });
  } else if (term.type === "rep" && APPORTIONMENT[term.state]) {
    // Non-voting delegates (DC, PR, territories) are not part of the 435.
    house.push({ state: term.state, district: term.district, party, caucus, name });
  }
}

// Detect vacancies: apportioned seats that nobody currently holds.
const held = new Set(house.map((m) => `${m.state}-${m.district}`));
const vacancies = [];
for (const [state, seats] of Object.entries(APPORTIONMENT)) {
  const districts = seats === 1 ? [0] : Array.from({ length: seats }, (_, i) => i + 1);
  for (const d of districts) if (!held.has(`${state}-${d}`)) vacancies.push({ state, district: d });
}

// For each vacancy, look up who held the seat most recently, so the app can
// tell whether a result is a "hold" or a "flip". The historical file is ~9 MB,
// so we only download it when there's a vacancy to resolve.
if (vacancies.length > 0) {
  const history = parse(await loadYaml(process.argv[3], HISTORICAL_URL));
  for (const v of vacancies) {
    let latest = null;
    for (const person of history) {
      for (const t of person.terms) {
        if (t.type !== "rep" || t.state !== v.state || t.district !== v.district) continue;
        if (!latest || t.end > latest.term.end) latest = { person, term: t };
      }
    }
    if (latest && latest.term.end >= "2025-01-03") {
      v.priorParty = partyCode(latest.term.party);
      v.priorName =
        latest.person.name.official_full ?? `${latest.person.name.first} ${latest.person.name.last}`;
      v.vacatedOn = latest.term.end;
    }
  }
}

senate.sort((a, b) => a.state.localeCompare(b.state) || a.class - b.class);
house.sort((a, b) => a.state.localeCompare(b.state) || a.district - b.district);

const out = {
  source: "https://github.com/unitedstates/congress-legislators",
  generatedAt: new Date().toISOString(),
  apportionment: APPORTIONMENT,
  senate,
  house,
  vacancies,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");

const count = (list, p) => list.filter((m) => m.party === p).length;
console.log(`Senate: ${senate.length} (R ${count(senate, "R")}, D ${count(senate, "D")}, I ${count(senate, "I")})`);
console.log(`  up in 2026: ${senate.filter((s) => s.upIn2026).length} seats` +
  ` (specials: ${senate.filter((s) => s.special).map((s) => s.state).join(", ") || "none"})`);
console.log(`House: ${house.length} seated (R ${count(house, "R")}, D ${count(house, "D")})`);
console.log(`  vacancies: ${vacancies.map((v) => `${v.state}-${v.district} (last held by ${v.priorName ?? "?"}, ${v.priorParty ?? "?"}, until ${v.vacatedOn ?? "?"})`).join("; ") || "none"}`);
console.log(`Wrote ${OUT}`);
