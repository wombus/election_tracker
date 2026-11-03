/**
 * Server-side configuration, read from environment variables.
 * See .env.example for documentation of every variable.
 */
export const ELECTION_DATE = "2026-11-03";

function intEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface AppConfig {
  providers: string[];
  refreshIntervalSeconds: number;
  minForcedRefreshSeconds: number;
  apApiKey?: string;
  apOfficeIds?: string;
  apTestMode: boolean;
  feedUrl?: string;
  /** Also pull NYT's per-state files (other statewide races, ballot measures). */
  nytStateFiles: boolean;
  demoSpeed: number;
  /** Simulator start time on election night, ET "HH:MM" (24h; 24:00+ = after midnight). */
  demoStart: string;
}

export function getConfig(): AppConfig {
  const apApiKey = process.env.AP_API_KEY?.trim() || undefined;
  const feedUrl = process.env.RESULTS_FEED_URL?.trim() || undefined;

  let providers = listEnv("DATA_PROVIDERS");
  if (providers.length === 0) {
    // Default: any paid/custom source you've configured first, then the two
    // free sources (NYT/AP primary, CNN/Decision Desk failover).
    if (apApiKey) providers.push("ap");
    if (feedUrl) providers.push("feed");
    providers.push("nyt", "cnn");
  }
  // DATA_PROVIDERS=none → roster only, no live sources.
  providers = [...new Set(providers)].filter((p) => p !== "none");

  return {
    providers,
    refreshIntervalSeconds: intEnv("REFRESH_INTERVAL_SECONDS", 300, 30),
    minForcedRefreshSeconds: intEnv("MIN_FORCED_REFRESH_SECONDS", 20, 5),
    apApiKey,
    apOfficeIds: process.env.AP_OFFICE_IDS?.trim() || undefined,
    apTestMode: process.env.AP_TEST_MODE === "true",
    feedUrl,
    nytStateFiles: process.env.NYT_STATE_FILES !== "false",
    demoSpeed: intEnv("DEMO_SPEED", 12, 1),
    demoStart: /^\d{1,2}:\d{2}$/.test(process.env.DEMO_START ?? "") ? process.env.DEMO_START! : "18:45",
  };
}
