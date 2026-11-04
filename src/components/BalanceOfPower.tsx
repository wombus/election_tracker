"use client";

/**
 * Chamber control at a glance: one tall segmented bar per body.
 *
 *   [ Dem secured | Dem leading | NPA | not yet called | Rep leading | Rep secured ]
 *
 * "Secured" = seats not on the ballot (holdovers) + seats won tonight.
 * The tick in the middle marks the control threshold.
 */
import { secured } from "@/lib/analysis";
import { PARTY_PLURAL } from "@/lib/format";
import type { ChamberTally, PartyCode } from "@/lib/types";
import { UpdateStamp } from "./UpdateStamp";
import { useResults } from "./ResultsProvider";

interface Segment {
  key: string;
  className: string;
  value: number;
  label: string;
}

function segments(t: ChamberTally): Segment[] {
  const seg = (p: PartyCode, kind: "won" | "lead"): Segment => {
    const value = kind === "won" ? secured(t[p]) : t[p].leading;
    const noun = PARTY_PLURAL[p];
    return {
      key: `${p}-${kind}`,
      className: kind === "won" ? `seg--${p}` : `seg--${p}-lean`,
      value,
      label: kind === "won" ? `${noun}: ${value} secured` : `${noun}: leading in ${value}`,
    };
  };
  return [
    seg("D", "won"),
    seg("D", "lead"),
    seg("I", "won"),
    seg("I", "lead"),
    { key: "awaiting", className: "seg--awaiting", value: t.awaiting, label: `${t.awaiting} not yet reporting` },
    seg("R", "lead"),
    seg("R", "won"),
  ].filter((s) => s.value > 0);
}

function Chamber({ name, tally, note }: { name: string; tally: ChamberTally; note: string }) {
  const { snapshot } = useResults();
  const total = (p: PartyCode) => secured(tally[p]) + tally[p].leading;
  const segs = segments(tally);
  const iTotal = total("I");

  return (
    <section className="bop" aria-label={`${name} balance of power`}>
      <header className="bop-head">
        <h2>{name}</h2>
        <span className="bop-need">{note}</span>
      </header>

      <div className="bop-figures">
        <div className="bop-fig bop-fig--D">
          <span className="bop-num">{secured(tally.D)}</span>
          <span className="bop-party">
            <span className="dot dot--D" aria-hidden="true" />
            Dem{tally.D.leading ? <em>+{tally.D.leading} leading</em> : null}
          </span>
        </div>
        {iTotal > 0 ? (
          <div className="bop-fig bop-fig--I">
            <span className="bop-num bop-num--sm">{secured(tally.I)}</span>
            <span className="bop-party">
              <span className="dot dot--I" aria-hidden="true" />
              NPA{tally.I.leading ? <em>+{tally.I.leading}</em> : null}
            </span>
          </div>
        ) : null}
        <div className="bop-fig bop-fig--R">
          <span className="bop-num">{secured(tally.R)}</span>
          <span className="bop-party">
            {tally.R.leading ? <em>+{tally.R.leading} leading</em> : null}Rep
            <span className="dot dot--R" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div
        className="vbar vbar--tall bop-bar"
        role="img"
        aria-label={`${name}: ${segs.map((s) => s.label).join(", ")}. ${tally.majority} needed for control.`}
      >
        {segs.map((s) => (
          <div key={s.key} className={`seg ${s.className}`} style={{ flexGrow: s.value }} title={s.label}>
            {s.value / tally.total >= 0.07 ? <span className="seg-label">{s.value}</span> : null}
          </div>
        ))}
        <span className="vbar-mid vbar-mid--strong" aria-hidden="true" />
      </div>

      <div className="bop-legend" aria-hidden="true">
        <span><i className="sw seg--D" />Won / held</span>
        <span><i className="sw seg--D-lean" />Leading</span>
        <span><i className="sw seg--I" />NPA / other</span>
        <span><i className="sw seg--awaiting" />Not yet reporting</span>
      </div>

      <UpdateStamp at={snapshot.fetchedAt} />
    </section>
  );
}

export function BalanceOfPower() {
  const { snapshot } = useResults();
  const { senate, house, governors } = snapshot.tallies;
  return (
    <div className="bop-row">
      <Chamber name="Senate" tally={senate} note={`51 for majority · ${senate.up} seats up`} />
      <Chamber name="House" tally={house} note={`218 for majority · all ${house.up} seats up`} />
      <Chamber name="Governors" tally={governors} note={`${governors.up} races tonight`} />
    </div>
  );
}
