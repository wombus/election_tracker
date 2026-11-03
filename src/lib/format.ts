/** Formatting helpers. Election-night convention is Eastern Time. */
import type { OfficeCode, PartyCode } from "./types";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});
const timeSecFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

/** "9:42 PM ET" — adds the date if it isn't election day. */
export function timeET(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const t = (withSeconds ? timeSecFmt : timeFmt).format(d);
  const day = dayFmt.format(d);
  return day === "Nov 3" ? `${t} ET` : `${day}, ${t} ET`;
}

/** "3 min ago", "just now". */
export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/** "4:07" countdown. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const intFmt = new Intl.NumberFormat("en-US");
export const votes = (n: number) => intFmt.format(n);

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export const PARTY_NAME: Record<PartyCode, string> = { D: "Democrat", R: "Republican", I: "Independent / Other" };
export const PARTY_SHORT: Record<PartyCode, string> = { D: "Dem", R: "Rep", I: "NPA" };
export const PARTY_PLURAL: Record<PartyCode, string> = { D: "Democrats", R: "Republicans", I: "Independents" };

export const OFFICE_NAME: Record<OfficeCode, string> = { S: "Senate", H: "House", G: "Governor", X: "Other races" };
