/**
 * "Bring your own feed" provider.
 *
 * Point RESULTS_FEED_URL at any JSON document shaped like the example below
 * (a state election-night scraper, a Google Sheet published as JSON through a
 * small script, a collector you run elsewhere…) and the tracker will merge it
 * in. Fields marked ? are optional.
 *
 * {
 *   "updated": "2026-11-04T01:45:00Z",
 *   "races": [{
 *     "id"?: "S-GA",                       // else derived from state/office/district
 *     "state": "GA",
 *     "office": "S" | "H" | "G" | "X",
 *     "district"?: 14,                     // House only; 0 = at-large
 *     "officeName"?: "Attorney General",   // used for office "X"
 *     "title"?: "Attorney General",
 *     "reportingPct"?: 41.2,
 *     "lastUpdated"?: "2026-11-04T01:44:10Z",
 *     "candidates": [{ "name": "…", "party": "D", "votes": 812345,
 *                      "winner"?: true, "incumbent"?: false }]
 *   }]
 * }
 */
import { finalizeRace } from "../analysis";
import { districtLabel, raceId } from "../roster";
import type { OfficeCode, PartyCode, Race } from "../types";
import { ProviderError, type Provider } from "./types";

interface FeedCandidate {
  name?: unknown;
  party?: unknown;
  votes?: unknown;
  winner?: unknown;
  runoff?: unknown;
  incumbent?: unknown;
}

interface FeedRace {
  id?: unknown;
  state?: unknown;
  office?: unknown;
  district?: unknown;
  officeName?: unknown;
  title?: unknown;
  subtitle?: unknown;
  reportingPct?: unknown;
  lastUpdated?: unknown;
  calledAt?: unknown;
  ballotMeasure?: unknown;
  candidates?: unknown;
}

export function feedParty(p: unknown): PartyCode {
  const s = String(p ?? "").trim().toLowerCase();
  if (["d", "dem", "democrat", "democratic", "dfl"].includes(s)) return "D";
  if (["r", "rep", "gop", "republican"].includes(s)) return "R";
  return "I";
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Validate and normalize one feed entry. Returns null for malformed entries. */
export function normalizeFeedRace(input: FeedRace, roster: Map<string, Race>, fallbackUpdated: string | null): Race | null {
  const state = str(input.state)?.toUpperCase();
  const officeRaw = str(input.office)?.toUpperCase();
  const office: OfficeCode | undefined =
    officeRaw === "S" || officeRaw === "H" || officeRaw === "G" || officeRaw === "X" ? officeRaw : undefined;
  if (!state || !office || !Array.isArray(input.candidates)) return null;

  const district = num(input.district);
  let id = str(input.id);
  if (!id) {
    if (office === "H") {
      if (district === undefined) return null;
      id = raceId("H", state, district);
    } else if (office === "X") {
      const slug = (str(input.officeName) ?? str(input.title) ?? "race").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      id = `X-${state}-${slug}`;
    } else {
      id = raceId(office, state);
    }
  }

  const base = roster.get(id);
  const isBallotMeasure = input.ballotMeasure === true;
  const candidates = (input.candidates as FeedCandidate[])
    .filter((c) => str(c?.name))
    .map((c, i) => ({
      id: `${id}-${i}`,
      name: str(c.name)!,
      party: isBallotMeasure ? ("I" as const) : feedParty(c.party),
      partyLabel: str(c.party) ?? "",
      votes: Math.max(0, Math.round(num(c.votes) ?? 0)),
      pct: 0,
      winner: c.winner === true || undefined,
      runoff: c.runoff === true || undefined,
      incumbent: c.incumbent === true || undefined,
    }));

  const reportingPct = num(input.reportingPct);
  const officeName = str(input.officeName) ?? base?.officeName ?? (office === "X" ? "Race" : office);

  return finalizeRace({
    id,
    state,
    office,
    officeName,
    title: str(input.title) ?? base?.title ?? (office === "H" && district !== undefined ? districtLabel(state, district) : officeName),
    subtitle: str(input.subtitle) ?? base?.subtitle,
    district: district ?? base?.district,
    special: base?.special,
    isBallotMeasure: isBallotMeasure || undefined,
    heldBy: base?.heldBy ?? null,
    holder: base?.holder,
    candidates,
    totalVotes: 0,
    reportingPct: reportingPct === undefined ? null : Math.min(100, Math.max(0, reportingPct)),
    status: "awaiting",
    winnerParty: null,
    calledAt: str(input.calledAt) ?? null,
    lastUpdated: str(input.lastUpdated) ?? fallbackUpdated,
    source: "feed",
    pollClose: base?.pollClose,
    note: base?.note,
    newLines: base?.newLines,
  });
}

export const feedProvider: Provider = {
  id: "feed",
  name: "Custom feed",

  async fetchRaces({ config, roster, signal }) {
    if (!config.feedUrl) throw new ProviderError("RESULTS_FEED_URL is not set");
    const res = await fetch(config.feedUrl, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) throw new ProviderError(`Feed responded ${res.status} ${res.statusText}`, res.status);
    const body = (await res.json()) as { updated?: unknown; races?: unknown };
    if (!Array.isArray(body.races)) throw new ProviderError("Feed JSON has no `races` array");

    const byId = new Map(roster.map((r) => [r.id, r]));
    const updated = str(body.updated) ?? null;
    return body.races
      .map((r) => normalizeFeedRace(r as FeedRace, byId, updated))
      .filter((r): r is Race => r !== null);
  },
};
