# Midterms 2026: Live Election Tracker

A live results tracker for the **November 3, 2026** U.S. midterms. Built with Next.js and TypeScript.

- **Clickable map.** Switch between Senate, Governor and House views. Click any state (or use the
  state picker) to see **every race on its ballot**: Senate, governor, every House district, and
  every other contest the live source reports (statewide offices, legislature, ballot measures).
- **Balance of power.** Senate, House and governors as Blue / Gray / Red bars (Dem / NPA / Rep),
  counting seats won, seats where a party is leading, and seats not on the ballot this year.
- **Flip Watch** (`/flips`). Seats that flipped, seats where the challenging party leads the count,
  and seats the holding party is barely keeping (under 3 points).
- **Called** (`/called`). Every race with a declared winner, races that *look* final (95%+ counted,
  not yet called), and runoffs. Filter by office, winner, hold/flip, or search.
- **Freshness everywhere.** Every results bar has a "last updated" timestamp underneath it and an
  **Update now** button. Everything refreshes automatically **every 5 minutes**.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then add a data source (see below)
npm run dev                    # http://localhost:3000
```

Want to see it working without a data source? Run the **simulator**. It replays a fictional
election night, and every page is labelled **SIMULATED** while it's on:

```bash
DATA_PROVIDERS=demo DEMO_START=21:30 npm run dev
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build && npm start`
(production), `npm run data` (regenerate the roster and map data; see below).

---

## Where the data comes from

There is **no free, official, nationwide, real-time election results API** in the U.S. Results are
counted by ~10,000 local jurisdictions and published by 50 state election offices in 50 different
formats. News organizations solve this by paying the **Associated Press**, which staffs every county
on election night and makes the race calls. This app is built around that reality.

| Source | What it gives us | Cost / access | How it's used |
|---|---|---|---|
| **[AP Elections API](https://developer.ap.org/ap-elections-api/)** | Vote counts and **race calls** for every race on the ballot, nationwide | Requires an API key (paid; AP offers developer/trial access) | `ap` provider. Set `AP_API_KEY`. **Recommended.** |
| **Your own JSON feed** | Whatever you point it at: a state election-night scraper, a collector you run, a spreadsheet export | Free | `feed` provider. Set `RESULTS_FEED_URL` (schema below). |
| **[unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)** | Who holds every Senate and House seat today (to tell a **hold** from a **flip**) | Free, public domain | Build step → `src/data/congress.json` |
| **[us-atlas](https://github.com/topojson/us-atlas)** (U.S. Census Bureau boundaries) | State shapes for the map | Free | Build step → `src/data/us-map.json` |
| `src/data/states.ts` (hand-curated) | Poll-closing times, sitting governors | n/a | Static |

Free sources I looked at but **did not build in**, because their formats couldn't be verified from the
build environment:

- **[civicAPI](https://civicapi.org/)** says it offers free live results with no key. Worth evaluating
  for a second provider.
- **News organizations' results JSON** (e.g. the AP-sourced files behind NYT's results pages) is
  public but undocumented, subject to their terms, and liable to change format without notice.
- **State election-night reporting sites** (many states use Clarity/Scytl ENR feeds) are official
  and free but differ per state. Each one is a small provider to write. They're a good fit for the
  `feed` provider or a dedicated adapter.

### With no source configured

The app still works. It shows all **506 federal and gubernatorial races** (35 Senate, including the
Ohio and Florida specials, 36 governors and 435 House seats) with the party currently holding each
seat, marked "awaiting results", and a banner explaining how to connect a source.

---

## How it works, step by step

Here is what happens from the moment you open the page to the moment a number changes on screen.

### 1. Build time: the roster and the map

`scripts/build-roster.mjs` downloads `legislators-current.yaml` and writes
`src/data/congress.json`: every senator (with class, so we know which 33 seats are in their regular
cycle) and every House member. It **detects vacancies** (seats with no current member) and looks up
the last holder in `legislators-historical.yaml`, so a vacant seat still has a "held by" party.
Appointed senators whose term ends at a special election today (Ohio, Florida) are picked up
automatically from the dataset's `end-type: special-election` field.

`scripts/build-map.mjs` turns the Census TopoJSON into plain SVG path strings. The browser never
downloads d3 or does projection math.

Both outputs are committed, so a deploy never depends on GitHub being reachable. Re-run
`npm run data` whenever membership changes.

### 2. The roster (`src/lib/roster.ts`)

Combines the generated data with `states.ts` into a baseline `Race` for every federal and
gubernatorial contest. This is the skeleton that live results are poured into, and it's why the map
is complete before a single vote is counted.

### 3. Providers (`src/lib/providers/`)

Each provider fetches one source and translates it into the app's **normalized `Race` type**
(`src/lib/types.ts`). That translation layer is the key design decision: the UI only ever knows
about `Race`, never about AP's JSON or anyone else's, so sources can be swapped or stacked without
touching a component.

- `ap.ts`: AP v3. Maps `officeID` S/H/G to Senate/House/Governor and everything else (statewide
  offices, ballot measures, legislature) to "other". Reads `winner: "X"` (called), `"R"` (runoff)
  and `"N"` (call retracted). Prefers `eevp` (expected-vote %) over precincts reporting.
- `feed.ts`: validates and normalizes a generic JSON document (schema below).
- `demo.ts`: the simulator (development only).

### 4. The store (`src/lib/store.ts`): caching and "every 5 minutes"

`getSnapshot()` is the only code that talks to sources:

1. If the cached snapshot is younger than `REFRESH_INTERVAL_SECONDS` (300), return it.
2. Otherwise call all providers **in parallel** (20 s timeout each) and **merge** them onto the
   roster. Providers are listed in priority order; for each race the most trusted provider *that
   has data* wins.
3. Compute chamber tallies (won / leading / holdover / awaiting).
4. Concurrent requests share **one in-flight pull**, so a traffic spike causes one upstream call.
5. If a provider fails, its **last good data is kept** and the failure is shown in a banner.
6. **Update now** forces a pull, but forced pulls are throttled server-wide
   (`MIN_FORCED_REFRESH_SECONDS`, default 20 s). A hundred people clicking at once is still one
   request to AP, which protects your API quota.

### 5. The API route (`src/app/api/results/route.ts`)

- `GET /api/results` returns the cached snapshot (briefly CDN-cacheable).
- `POST /api/results` is "Update now". It's a POST because it triggers work and must never be served
  from a cache.

### 6. The browser (`src/components/ResultsProvider.tsx`)

The page is **server-rendered with data already in it**, so there's no loading spinner. Then the
client:

- schedules its next poll for the exact moment the server's cache expires (`nextRefreshAt`), which
  is what keeps everything on a true 5-minute cadence without drifting;
- catches up immediately when a background tab becomes visible;
- keeps the previous results on screen if a request fails (no blank flash).

Every "Update now" button calls the same `refresh()`. Because AP returns all races in one response,
refreshing one race and refreshing all of them cost the same upstream call, so the whole snapshot
updates.

### 7. Derived meaning (`src/lib/analysis.ts`)

Pure functions, unit tested:

- **Flip:** called for a party other than the one holding the seat. An incumbent who changed party
  labels and won again is not a flip.
- **Trending:** counting, and a challenger from another party leads.
- **At risk:** the holding party leads by under 3 points.
- **Looks final:** 95%+ of the expected vote counted but no call yet.

---

## Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATA_PROVIDERS` | auto | Comma list in priority order: `ap`, `feed`, `demo`. Auto = `ap` if `AP_API_KEY` set, plus `feed` if `RESULTS_FEED_URL` set. |
| `AP_API_KEY` | | AP Elections API key. |
| `AP_OFFICE_IDS` | all | e.g. `S,H,G` to fetch only federal and governor races (smaller payload). |
| `AP_TEST_MODE` | `false` | `true` requests AP's test data (`resultsType=t`). Handy for rehearsing before polls close. |
| `RESULTS_FEED_URL` | | URL of a JSON feed in the format below. |
| `REFRESH_INTERVAL_SECONDS` | `300` | Server cache TTL and browser auto-refresh cadence. |
| `MIN_FORCED_REFRESH_SECONDS` | `20` | Server-wide throttle for "Update now". |
| `DEMO_SPEED` / `DEMO_START` | `12` / `18:45` | Simulator clock speed and start time (ET). |

### Bring your own feed

```json
{
  "updated": "2026-11-04T01:45:00Z",
  "races": [
    {
      "state": "GA",
      "office": "S",
      "reportingPct": 41.2,
      "lastUpdated": "2026-11-04T01:44:10Z",
      "candidates": [
        { "name": "Candidate A", "party": "D", "votes": 812345 },
        { "name": "Candidate B", "party": "R", "votes": 790120, "incumbent": true }
      ]
    },
    { "state": "PA", "office": "H", "district": 7, "candidates": [ ... ] },
    { "state": "FL", "office": "X", "officeName": "Amendment 4", "ballotMeasure": true,
      "candidates": [ { "name": "Yes", "votes": 5100000 }, { "name": "No", "votes": 3900000 } ] }
  ]
}
```

`office` is `S`, `H`, `G` or `X` (anything else). House `district` 0 means at-large. Set
`"winner": true` on a candidate to mark a call. Party accepts `D`/`Dem`/`Democratic`,
`R`/`Rep`/`GOP`/`Republican`; anything else is shown as NPA/other (gray).

### Adding a new source

Write a `Provider` (`src/lib/providers/types.ts`) whose `fetchRaces()` returns `Race[]` (call
`finalizeRace()` to fill in shares and status), then register it in `REGISTRY` in `src/lib/store.ts`.
The roster gives you stable race IDs: `S-GA`, `G-GA`, `H-GA-14`, `H-WY-0`.

---

## Deploying

Any Node host works (`npm run build && npm start`). On **Vercel**: import the repo, add `AP_API_KEY`
(and/or `RESULTS_FEED_URL`) under Environment Variables, deploy. Each serverless instance keeps its
own 5-minute cache, so worst case is one upstream call per warm instance per interval.

## Caveats

- **Redistricting.** California, Missouri, North Carolina, Ohio, Texas and Utah redrew House maps
  for 2026. For those districts, "held by" is the current member for that district number, and the
  district may have very different lines now. These cards carry a **New map** tag.
- **Ranked-choice and runoffs.** Maine and Alaska tabulate later rounds after election night;
  Georgia requires a majority (runoffs are shown as such). The tracker shows what the source reports.
- **Hand-curated facts** (`src/data/states.ts`: governors, poll-close times) reflect the state of
  play as of this build. Check them if you reuse the project for a later election.

## Project layout

```
scripts/            build-roster.mjs, build-map.mjs   (generate src/data/*.json)
src/data/           congress.json, us-map.json, states.ts
src/lib/            types, config, roster, analysis, map-fills, store, format
src/lib/providers/  ap, feed, demo
src/app/            layout, page (map), flips/, called/, api/results/
src/components/     MapView, USMap, StatePanel, RaceCard, VoteBar, BalanceOfPower,
                    UpdateStamp, ResultsProvider, Header, FlipWatch, CalledRaces, ...
```
