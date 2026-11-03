#!/usr/bin/env node
/**
 * Smoke-test the live results sources from YOUR machine:
 *
 *   npm run check-sources
 *
 * For each endpoint it reports the HTTP status, how many races came back,
 * whether the fields this app relies on are present, and one sample race,
 * so you can confirm the feeds work (and haven't changed format) in seconds.
 */
const DATE = "2026-11-03";
const NYT = `https://static01.nyt.com/elections-assets/pages/data/${DATE}`;
const CNN = "https://politics.api.cnn.io/results/national-races";
const UA = { "User-Agent": "election-tracker/1.0 (personal results dashboard)", Accept: "application/json" };

const checks = [
  { name: "NYT/AP  Senate", url: `${NYT}/results-senate.json`, kind: "nyt" },
  { name: "NYT/AP  Governor", url: `${NYT}/results-governor.json`, kind: "nyt" },
  { name: "NYT/AP  House", url: `${NYT}/results-house.json`, kind: "nyt" },
  { name: "NYT/AP  Florida (state file)", url: `${NYT}/results-florida.json`, kind: "nyt" },
  { name: "CNN/DDHQ Senate", url: `${CNN}/2026-SG.json`, kind: "cnn" },
  { name: "CNN/DDHQ Governor", url: `${CNN}/2026-GG.json`, kind: "cnn" },
  { name: "CNN/DDHQ House", url: `${CNN}/2026-HG.json`, kind: "cnn" },
];

function inspectNyt(body) {
  const races = body?.races ?? [];
  const r = races.find((x) => x?.top_reporting_unit?.state_postal && x.top_reporting_unit.state_postal !== "US") ?? races[0];
  const missing = [];
  if (!Array.isArray(body?.races)) missing.push("races[]");
  if (r) {
    for (const k of ["office_id", "candidate_metadata", "top_reporting_unit"]) if (!(k in r)) missing.push(k);
    const tru = r.top_reporting_unit ?? {};
    for (const k of ["state_postal", "candidates"]) if (!(k in tru)) missing.push(`top_reporting_unit.${k}`);
  }
  let sample = "";
  if (r) {
    const meta = r.candidate_metadata ?? {};
    const votes = new Map((r.top_reporting_unit?.candidates ?? []).map((c) => [c.nyt_id, c.votes?.total ?? 0]));
    const cands = Object.values(meta)
      .map((m) => `${[m.first_name, m.last_name].filter(Boolean).join(" ")} (${m.party?.nyt_id ?? "?"}) ${votes.get(m.nyt_id) ?? 0}`)
      .join(" | ");
    sample = `${r.top_reporting_unit?.state_postal} ${r.office ?? r.office_id}${r.seat_number ? `-${r.seat_number}` : ""}: ${cands}; eevp=${r.top_reporting_unit?.eevp ?? "?"}; won=${JSON.stringify(r.outcome?.won ?? [])}`;
  }
  return { count: races.length, missing, sample };
}

function inspectCnn(body) {
  const races = Array.isArray(body) ? body : body ? [body] : [];
  const r = races[0];
  const missing = [];
  if (r) {
    for (const k of ["ecKey", "raceType", "stateAbbreviation", "candidates", "percentReporting", "totalVote"]) if (!(k in r)) missing.push(k);
    const c = r.candidates?.[0];
    if (c) for (const k of ["fullName", "majorParty", "voteNum", "winner"]) if (!(k in c)) missing.push(`candidates[].${k}`);
  }
  const sample = r
    ? `${r.ecKey}: ${(r.candidates ?? []).map((c) => `${c.fullName} (${c.majorParty}) ${c.voteNum}${c.winner ? " ✓" : ""}`).join(" | ")}; ${r.percentReporting}% in; status=${r.status}`
    : "";
  return { count: races.length, missing, sample };
}

let failures = 0;
for (const c of checks) {
  const started = Date.now();
  try {
    const res = await fetch(c.url, { headers: UA });
    const ms = Date.now() - started;
    if (!res.ok) {
      failures++;
      console.log(`✗ ${c.name.padEnd(30)} HTTP ${res.status} (${ms} ms)  ${c.url}`);
      continue;
    }
    const body = await res.json();
    const { count, missing, sample } = c.kind === "nyt" ? inspectNyt(body) : inspectCnn(body);
    const ok = missing.length === 0 && count > 0;
    if (!ok) failures++;
    console.log(`${ok ? "✓" : "!"} ${c.name.padEnd(30)} ${count} races (${ms} ms)${missing.length ? `  MISSING FIELDS: ${missing.join(", ")}` : ""}`);
    if (sample) console.log(`    e.g. ${sample.slice(0, 220)}`);
  } catch (err) {
    failures++;
    console.log(`✗ ${c.name.padEnd(30)} ${err instanceof Error ? err.message : err}  ${c.url}`);
  }
}

console.log(
  failures === 0
    ? "\nAll sources reachable and in the expected format."
    : `\n${failures} check(s) failed. The app keeps working on whichever source answers; see README → Data sources.`,
);
process.exitCode = failures === checks.length ? 1 : 0;
