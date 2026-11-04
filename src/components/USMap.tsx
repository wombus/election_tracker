"use client";

/**
 * Interactive U.S. map. Paths are pre-rendered at build time (see
 * scripts/build-map.mjs), so this component is just SVG + event handlers.
 *
 * - Click (or Enter/Space on a focused state) selects a state.
 * - Hover or keyboard focus shows a tooltip with the race summary.
 * - Small Northeast states get labelled tiles with hairline leader lines,
 *   because their shapes are too small to click or label reliably.
 */
import { useMemo, useRef, useState } from "react";
import mapData from "@/data/us-map.json";

export type MapFill = "D" | "D-lean" | "R" | "R-lean" | "I" | "I-lean" | "pending" | "none";

export interface StateFill {
  fill: MapFill;
  /** Lines shown in the tooltip. */
  summary: string[];
}

interface MapState {
  postal: string;
  name: string;
  d: string;
  cx: number;
  cy: number;
  area: number;
}

const STATES = mapData.states as MapState[];

/** States rendered as side tiles instead of inline labels. */
const TILE_STATES = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"];
const TILE_X = 928;
const TILE_Y0 = 188;
const TILE_W = 36;
const TILE_H = 22;
const TILE_GAP = 5;

/** Nudge labels whose geometric centroid sits awkwardly (e.g. Florida's panhandle). */
const LABEL_OFFSET: Record<string, [number, number]> = {
  FL: [18, 12], LA: [-10, -6], MI: [16, 24], KY: [6, 3], CA: [-8, 0], ID: [0, 18],
  VA: [8, 2], NY: [6, 0], WV: [-4, 6], MN: [-6, 0], OK: [12, 0], NC: [6, 0], TX: [4, 8],
  HI: [-30, -18], AK: [0, 0],
};

function inkClass(fill: MapFill): string {
  if (fill === "pending" || fill === "none") return "lbl--muted";
  return fill.endsWith("-lean") ? "lbl--lean" : "lbl--solid";
}

export function USMap({
  fills,
  selected,
  onSelect,
  ariaLabel,
}: {
  fills: Record<string, StateFill>;
  selected: string | null;
  onSelect: (postal: string) => void;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ postal: string; x: number; y: number } | null>(null);

  const byPostal = useMemo(() => Object.fromEntries(STATES.map((s) => [s.postal, s])), []);

  function showAt(postal: string, clientX?: number, clientY?: number) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    let x: number, y: number;
    if (clientX !== undefined && clientY !== undefined) {
      x = clientX - box.left;
      y = clientY - box.top;
    } else {
      // Keyboard focus: anchor the tooltip to the state's label position.
      const s = byPostal[postal];
      const tileIdx = TILE_STATES.indexOf(postal);
      const [vx, vy] = tileIdx >= 0 ? [TILE_X, TILE_Y0 + tileIdx * (TILE_H + TILE_GAP)] : [s.cx, s.cy];
      x = (vx / mapData.width) * box.width;
      y = (vy / mapData.height) * box.height;
    }
    setHover({ postal, x, y });
  }

  const handlers = (postal: string) => ({
    onClick: () => onSelect(postal),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(postal);
      }
    },
    onMouseMove: (e: React.MouseEvent) => showAt(postal, e.clientX, e.clientY),
    onMouseLeave: () => setHover(null),
    onFocus: () => showAt(postal),
    onBlur: () => setHover(null),
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `${byPostal[postal]?.name}: ${(fills[postal]?.summary ?? ["No races"]).join(". ")}`,
    "aria-pressed": selected === postal,
  });

  const hovered = hover ? byPostal[hover.postal] : null;
  const tooltipLines = hover ? (fills[hover.postal]?.summary ?? ["No race in this view"]) : [];
  const flipLeft = hover && wrap.current ? hover.x > wrap.current.clientWidth * 0.62 : false;

  return (
    <div className="map-wrap" ref={wrap}>
      <svg viewBox={`0 0 ${mapData.width} ${mapData.height}`} className="map" role="group" aria-label={ariaLabel}>
        <g className="map-states">
          {STATES.map((s) => (
            <path
              key={s.postal}
              d={s.d}
              className={`st fill--${fills[s.postal]?.fill ?? "none"} ${selected === s.postal ? "st--selected" : ""} ${hover?.postal === s.postal ? "st--hover" : ""}`}
              {...handlers(s.postal)}
            />
          ))}
        </g>
        <path d={mapData.nation} className="map-nation" aria-hidden="true" />

        {/* Re-draw the selected state on top so its outline isn't hidden by neighbours. */}
        {selected && byPostal[selected] ? (
          <path d={byPostal[selected].d} className="st-outline" aria-hidden="true" />
        ) : null}

        <g className="map-labels" aria-hidden="true">
          {STATES.filter((s) => !TILE_STATES.includes(s.postal)).map((s) => {
            const [dx, dy] = LABEL_OFFSET[s.postal] ?? [0, 0];
            return (
              <text key={s.postal} x={s.cx + dx} y={s.cy + dy} className={`lbl ${inkClass(fills[s.postal]?.fill ?? "none")}`}>
                {s.postal}
              </text>
            );
          })}
        </g>

        <g className="map-tiles">
          {TILE_STATES.map((postal, i) => {
            const s = byPostal[postal];
            if (!s) return null;
            const y = TILE_Y0 + i * (TILE_H + TILE_GAP);
            const fill = fills[postal]?.fill ?? "none";
            return (
              <g key={postal} className="mtile" {...handlers(postal)}>
                <line x1={s.cx} y1={s.cy} x2={TILE_X - 3} y2={y + TILE_H / 2} className="mtile-leader" />
                <rect
                  x={TILE_X}
                  y={y}
                  width={TILE_W}
                  height={TILE_H}
                  rx={4}
                  className={`st fill--${fill} ${selected === postal ? "st--selected" : ""}`}
                />
                <text x={TILE_X + TILE_W / 2} y={y + TILE_H / 2 + 0.5} className={`lbl lbl--tile ${inkClass(fill)}`}>
                  {postal}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hover && hovered ? (
        <div
          className={`map-tip ${flipLeft ? "map-tip--left" : ""}`}
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <strong>{hovered.name}</strong>
          {tooltipLines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
          <em>Click for every race</em>
        </div>
      ) : null}
    </div>
  );
}
