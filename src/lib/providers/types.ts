import type { AppConfig } from "../config";
import type { Race } from "../types";

export interface ProviderContext {
  config: AppConfig;
  /** The baseline roster, so providers can align IDs and seat metadata. */
  roster: Race[];
  signal: AbortSignal;
  now: Date;
}

/**
 * A provider pulls results from one source and returns normalized races.
 * Adding a new source (a state's election-night feed, another API) means
 * writing one of these. Nothing else in the app has to change.
 */
export interface Provider {
  id: string;
  name: string;
  url?: string;
  /** True for the simulator, so the UI can label every number as fake. */
  simulated?: boolean;
  fetchRaces(ctx: ProviderContext): Promise<Race[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
