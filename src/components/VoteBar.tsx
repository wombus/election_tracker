/**
 * The Red / Blue / Gray results bar.
 *
 * A segmented bar: one block per candidate, width ∝ votes, blue (Dem) on the
 * left, gray (independent / NPA / other) in the middle, red (Rep) on the right,
 * so the 50% tick reads the same way on every race. Segments are separated by
 * a 2px surface-colored gap (via CSS `gap`) instead of borders, and flex-grow
 * by vote count makes widths exact even with the gaps.
 */
import { pct } from "@/lib/format";
import type { Candidate, Race } from "@/lib/types";

const SIDE: Record<Candidate["party"], number> = { D: 0, I: 1, R: 2 };

function segmentClass(c: Candidate, race: Race, index: number, seen: Map<string, number>): string {
  if (race.isBallotMeasure) return /^no\b/i.test(c.name) ? "seg--no" : /^yes\b/i.test(c.name) ? "seg--yes" : "seg--I";
  const n = seen.get(c.party) ?? 0;
  seen.set(c.party, n + 1);
  // Two candidates of one party (top-two primaries) get a second shade.
  return n === 0 ? `seg--${c.party}` : `seg--${c.party} seg--alt`;
}

export function VoteBar({ race, size = "tall" }: { race: Race; size?: "tall" | "thin" }) {
  const counted = race.candidates.filter((c) => c.votes > 0);
  if (race.totalVotes <= 0 || counted.length === 0) {
    return (
      <div className={`vbar vbar--${size} vbar--empty`} role="img" aria-label="No votes reported yet">
        <span className="vbar-mid" aria-hidden="true" />
      </div>
    );
  }

  const ordered = race.isBallotMeasure
    ? [...counted].sort((a, b) => (/^yes/i.test(a.name) ? -1 : /^yes/i.test(b.name) ? 1 : 0))
    : [...counted].sort((a, b) => SIDE[a.party] - SIDE[b.party] || (a.party === "R" ? a.votes - b.votes : b.votes - a.votes));

  const seen = new Map<string, number>();
  const label = ordered.map((c) => `${c.name} ${pct(c.pct)}`).join(", ");

  return (
    <div className={`vbar vbar--${size}`} role="img" aria-label={`Vote share: ${label}`}>
      {ordered.map((c, i) => (
        <div
          key={c.id}
          className={`seg ${segmentClass(c, race, i, seen)}`}
          style={{ flexGrow: c.votes }}
          title={`${c.name} (${c.partyLabel || c.party}): ${pct(c.pct)}`}
        >
          {/* Only label a segment when the text comfortably fits inside it. */}
          {size === "tall" && c.pct >= 11 ? <span className="seg-label">{pct(c.pct)}</span> : null}
        </div>
      ))}
      <span className="vbar-mid" aria-hidden="true" />
    </div>
  );
}
