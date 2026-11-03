/**
 * The snapshot store: the single place the server talks to data sources.
 *
 * Flow for every request:
 *   1. If the cached snapshot is younger than REFRESH_INTERVAL_SECONDS → return it.
 *   2. Otherwise pull every configured provider in parallel, merge them onto the
 *      roster, compute tallies, cache, return.
 *   3. "Update now" (force) skips the TTL, but is throttled server-wide by
 *      MIN_FORCED_REFRESH_SECONDS so a hundred clicks = one upstream request.
 *   4. Concurrent requests share one in-flight pull (no thundering herd).
 *   5. If a provider fails, its last good data is kept and the error surfaced.
 *
 * State lives on globalThis so it survives Next.js dev-mode hot reloads. In a
 * serverless deployment each warm instance has its own cache, which is fine:
 * the worst case is one upstream call per instance per interval.
 */
import { finalizeRace, tallyChamber } from "./analysis";
import { ELECTION_DATE, getConfig, type AppConfig } from "./config";
import { apProvider } from "./providers/ap";
import { cnnProvider } from "./providers/cnn";
import { demoProvider, virtualNow } from "./providers/demo";
import { feedProvider } from "./providers/feed";
import { nytProvider } from "./providers/nyt";
import type { Provider } from "./providers/types";
import { buildRoster, SENATORS } from "./roster";
import { STATES } from "@/data/states";
import type { PartyCode, Race, Snapshot, SourceStatus } from "./types";

const REGISTRY: Record<string, Provider> = {
  ap: apProvider,
  feed: feedProvider,
  nyt: nytProvider,
  cnn: cnnProvider,
  demo: demoProvider,
};

const PROVIDER_TIMEOUT_MS = 20_000;
/** Max time a normal request waits for a refresh before serving the previous snapshot. */
const STALE_WAIT_MS = 2_500;

interface StoreState {
  snapshot: Snapshot | null;
  inflight: Promise<Snapshot> | null;
  lastGood: Map<string, { races: Race[]; at: string }>;
}

const g = globalThis as typeof globalThis & { __electionStore?: StoreState };
const store: StoreState = (g.__electionStore ??= { snapshot: null, inflight: null, lastGood: new Map() });

/** Does this race carry real numbers (votes or a call)? */
function hasData(r: Race): boolean {
  return r.totalVotes > 0 || r.status === "called" || r.status === "runoff";
}

const lastName = (name: string) => name.trim().split(/\s+/).at(-1)?.toLowerCase() ?? "";

/**
 * If `race` has no call but another source called it, adopt that call: mark
 * the matching candidate (same party + last name) as the winner and label who
 * made the call. Votes still come from the preferred source.
 */
export function adoptCall(race: Race, other: Race): Race {
  if (race.status === "called" || other.status !== "called") return race;
  const theirWinner = other.candidates.find((c) => c.winner);
  if (!theirWinner) return race;
  const match = race.candidates.find(
    (c) => c.party === theirWinner.party && lastName(c.name) === lastName(theirWinner.name),
  );
  if (!match) return race;
  return finalizeRace({
    ...race,
    candidates: race.candidates.map((c) => (c === match ? { ...c, winner: true, runoff: undefined } : c)),
    calledAt: other.calledAt,
    calledBy: other.calledBy,
  });
}

/**
 * Overlay provider results onto the roster. `lists` is in priority order
 * (first = most trusted). For each race the most trusted provider *with data*
 * wins, a call from any provider is honored (first call wins), and roster
 * metadata (held by, holder, poll close, notes) is preserved.
 */
export function mergeRaces(roster: Race[], lists: Race[][]): Race[] {
  const merged = new Map(roster.map((r) => [r.id, r]));
  const chosen = new Map<string, Race>();
  const all = new Map<string, Race[]>();

  for (const list of lists) {
    for (const race of list) {
      all.set(race.id, [...(all.get(race.id) ?? []), race]);
      const prev = chosen.get(race.id);
      if (!prev || (!hasData(prev) && hasData(race))) chosen.set(race.id, race);
    }
  }

  for (const [id, picked] of chosen) {
    let race = picked;
    for (const other of all.get(id) ?? []) if (other !== picked) race = adoptCall(race, other);
    const base = merged.get(id);
    if (base && race.candidates.length === 0) continue; // nothing live to show yet
    merged.set(
      id,
      base
        ? {
            ...race,
            heldBy: race.heldBy ?? base.heldBy,
            holder: race.holder ?? base.holder,
            pollClose: race.pollClose ?? base.pollClose,
            note: race.note ?? base.note,
            newLines: race.newLines ?? base.newLines,
            special: race.special ?? base.special,
            subtitle: race.subtitle ?? base.subtitle,
            title: base.title,
          }
        : race,
    );
  }
  return [...merged.values()];
}

function countBy<T>(items: T[], key: (t: T) => PartyCode): Partial<Record<PartyCode, number>> {
  const out: Partial<Record<PartyCode, number>> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return out;
}

export function computeTallies(races: Race[], rosterIds: Set<string>): Snapshot["tallies"] {
  // Only roster races count toward chambers (excludes DC/territory delegates).
  const core = races.filter((r) => rosterIds.has(r.id));
  return {
    senate: tallyChamber(core.filter((r) => r.office === "S"), {
      total: 100,
      majority: 51,
      holdovers: countBy(SENATORS.filter((s) => !s.upIn2026), (s) => s.party),
    }),
    house: tallyChamber(core.filter((r) => r.office === "H"), { total: 435, majority: 218, holdovers: {} }),
    governors: tallyChamber(core.filter((r) => r.office === "G"), {
      total: 50,
      majority: 26,
      holdovers: countBy(
        STATES.filter((s) => s.governor && !s.governor.upIn2026),
        (s) => s.governor!.party,
      ),
    }),
  };
}

async function pull(config: AppConfig): Promise<Snapshot> {
  const now = new Date();
  const roster = buildRoster();
  const providers = config.providers.map((id) => REGISTRY[id]).filter(Boolean);

  const results = await Promise.all(
    providers.map(async (p): Promise<{ status: SourceStatus; races: Race[] }> => {
      const checkedAt = new Date().toISOString();
      try {
        const races = await p.fetchRaces({ config, roster, now, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
        store.lastGood.set(p.id, { races, at: checkedAt });
        return {
          races,
          status: { id: p.id, name: p.name, url: p.url, ok: true, checkedAt, lastSuccessAt: checkedAt, raceCount: races.length, simulated: p.simulated },
        };
      } catch (err) {
        const prev = store.lastGood.get(p.id);
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[results] provider ${p.id} failed: ${message}`);
        return {
          races: prev?.races ?? [],
          status: {
            id: p.id, name: p.name, url: p.url, ok: false, error: message, checkedAt,
            lastSuccessAt: prev?.at ?? null, raceCount: prev?.races.length ?? 0, simulated: p.simulated,
          },
        };
      }
    }),
  );

  // Failover: a provider that failed this round only supplies its last good
  // data, so it drops behind every provider that answered.
  const ordered = [...results.filter((r) => r.status.ok), ...results.filter((r) => !r.status.ok)];
  const races = mergeRaces(roster, ordered.map((r) => r.races));
  const rosterIds = new Set(roster.map((r) => r.id));
  const simulated = providers.some((p) => p.simulated);

  return {
    electionDate: ELECTION_DATE,
    fetchedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + config.refreshIntervalSeconds * 1000).toISOString(),
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    sources: results.map((r) => r.status),
    simulated,
    rosterOnly: providers.length === 0,
    simulatedClock: simulated ? new Date(virtualNow(now, config.demoSpeed, config.demoStart)).toISOString() : undefined,
    races,
    tallies: computeTallies(races, rosterIds),
  };
}

/** Tests only: forget cached snapshots and last-good provider data. */
export function resetStoreForTests(): void {
  store.snapshot = null;
  store.inflight = null;
  store.lastGood.clear();
}

export async function getSnapshot({ force = false }: { force?: boolean } = {}): Promise<Snapshot> {
  const config = getConfig();
  const current = store.snapshot;
  if (current) {
    const age = Date.now() - Date.parse(current.fetchedAt);
    const fresh = age < config.refreshIntervalSeconds * 1000;
    const throttled = age < config.minForcedRefreshSeconds * 1000;
    if ((!force && fresh) || (force && throttled)) return current;
  }
  if (!store.inflight) {
    store.inflight = pull(config)
      .then((snap) => (store.snapshot = snap))
      .finally(() => (store.inflight = null));
  }
  // Stale-while-revalidate: if we already have results, don't make a page
  // load wait more than a moment on slow sources. The pull keeps running and
  // the next poll picks it up. ("Update now" always waits for fresh data.)
  if (current && !force) {
    const timeout = new Promise<Snapshot>((resolve) => setTimeout(() => resolve(current), STALE_WAIT_MS));
    return Promise.race([store.inflight, timeout]);
  }
  return store.inflight;
}
