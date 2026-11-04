#!/usr/bin/env node
/**
 * Pre-renders the U.S. state outlines into SVG path strings: src/data/us-map.json.
 *
 * Source: the `us-atlas` package (Census Bureau cartographic boundaries,
 * TopoJSON), specifically `states-albers-10m.json`, which is already projected
 * with Albers USA into a 975×610 viewport — Alaska and Hawaii are moved into
 * the lower-left corner the way every election map shows them.
 *
 * Doing this at build time means the browser receives plain `d="M…"` strings:
 * no d3 or topojson in the client bundle, and no projection math per render.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data/us-map.json");

const FIPS_TO_POSTAL = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

const topo = JSON.parse(
  await readFile(require.resolve("us-atlas/states-albers-10m.json"), "utf8"),
);

// The topology is pre-projected, so the path generator needs no projection.
// digits(1) rounds coordinates to 0.1px — invisible on screen, ~60% smaller file.
const path = geoPath().digits(1);

const states = feature(topo, topo.objects.states)
  .features.filter((f) => FIPS_TO_POSTAL[f.id])
  .map((f) => {
    const [cx, cy] = path.centroid(f);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    return {
      postal: FIPS_TO_POSTAL[f.id],
      fips: f.id,
      name: f.properties.name,
      d: path(f),
      cx: Math.round(cx * 10) / 10,
      cy: Math.round(cy * 10) / 10,
      bbox: [x0, y0, x1, y1].map((n) => Math.round(n)),
      area: Math.round(path.area(f)),
    };
  })
  .sort((a, b) => a.postal.localeCompare(b.postal));

// The outer national border, drawn once on top so the coastline stays crisp.
const nation = path(mesh(topo, topo.objects.nation));

await writeFile(OUT, JSON.stringify({ width: 975, height: 610, nation, states }) + "\n");
console.log(`Wrote ${states.length} state shapes to ${OUT}`);
