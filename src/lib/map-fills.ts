/**
 * Decides each state's map color and tooltip text for a given view.
 *
 * Senate / Governor views: one race per state.
 *   called → solid party color · counting → lighter "leading" tint ·
 *   no votes → pending · no race this year → none
 *
 * House view: a 5-class diverging scale on the share of the state's seats that
 * Democrats are winning or leading (blue ← gray → red), so a 26-seat New York
 * and a 1-seat Wyoming are both readable.
 */
import { leader, marginPts } from "./analysis";
import { PARTY_SHORT, pct, timeET } from "./format";
import type { OfficeCode, Race } from "./types";
import type { MapFill, StateFill } from "@/components/USMap";
import { STATES } from "@/data/states";

export type MapMode = Extract<OfficeCode, "S" | "G" | "H">;

export const MODE_LABEL: Record<MapMode, string> = { S: "Senate", G: "Governor", H: "House" };

function singleRaceFill(race: Race | undefined, label: string): StateFill {
  if (!race) return { fill: "none", summary: [`No ${label.toLowerCase()} race this year`] };
  const special = race.special ? " (special)" : "";
  if (race.status === "awaiting") {
    const closes = race.pollClose && Date.parse(race.pollClose) > Date.now();
    return {
      fill: "pending",
      summary: [`${label}${special}: ${closes ? `polls close ${timeET(race.pollClose)}` : "awaiting results"}`],
    };
  }
  const top = leader(race);
  if (!top) return { fill: "pending", summary: [`${label}${special}: awaiting results`] };
  const tag = `${top.name} (${PARTY_SHORT[top.party]})`;
  if (race.status === "called") {
    return { fill: (race.winnerParty ?? "I") as MapFill, summary: [`${label}${special}: called for ${tag}`] };
  }
  const second = race.candidates[1];
  const lead = second ? `${pct(top.pct)}–${pct(second.pct)}` : pct(top.pct);
  return {
    fill: `${top.party}-lean` as MapFill,
    summary: [
      `${label}${special}: ${tag} leads ${lead}`,
      `${race.reportingPct != null ? `${Math.round(race.reportingPct)}% in` : "Counting"} · margin ${marginPts(race).toFixed(1)} pts${race.status === "runoff" ? " · runoff" : ""}`,
    ],
  };
}

export function houseFill(races: Race[]): StateFill {
  const n = { D: 0, R: 0, I: 0 };
  let called = 0;
  for (const r of races) {
    const top = r.status === "called" ? r.winnerParty : r.status === "awaiting" ? null : leader(r)?.party;
    if (!top) continue;
    n[top] += 1;
    if (r.status === "called") called += 1;
  }
  const reporting = n.D + n.R + n.I;
  const seats = `${races.length} seat${races.length === 1 ? "" : "s"}`;
  if (reporting === 0) return { fill: "pending", summary: [`House: ${seats}, awaiting results`] };

  const share = n.D / reporting;
  const rShare = n.R / reporting;
  const fill: MapFill =
    share >= 0.8 ? "D" : share >= 0.55 ? "D-lean" : rShare >= 0.8 ? "R" : rShare >= 0.55 ? "R-lean" : "I-lean";
  const parts = [`Dem ${n.D}`, `Rep ${n.R}`, n.I ? `NPA ${n.I}` : ""].filter(Boolean).join(" · ");
  return {
    fill,
    summary: [`House (${seats}): ${parts} won or leading`, `${called} called · ${races.length - reporting} awaiting`],
  };
}

export function mapFills(races: Race[], mode: MapMode): Record<string, StateFill> {
  const out: Record<string, StateFill> = {};
  if (mode === "H") {
    const byState = new Map<string, Race[]>();
    for (const r of races) {
      if (r.office !== "H" || r.district === undefined) continue;
      const list = byState.get(r.state) ?? [];
      list.push(r);
      byState.set(r.state, list);
    }
    for (const s of STATES) {
      const list = byState.get(s.postal);
      out[s.postal] = list ? houseFill(list) : { fill: "none", summary: ["No voting House seat"] };
    }
    return out;
  }
  const label = MODE_LABEL[mode];
  for (const s of STATES) out[s.postal] = singleRaceFill(races.find((r) => r.id === `${mode}-${s.postal}`), label);
  return out;
}
