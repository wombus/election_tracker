/**
 * Hand-curated per-state facts that no single public API provides in a clean
 * form: the time the LAST polls close statewide (election night, Eastern Time)
 * and the party of the sitting governor.
 *
 * Senate and House seat holders are NOT here — they're generated from the
 * congress-legislators dataset into congress.json (see scripts/build-roster.mjs).
 *
 * Poll-close times are the conventional "all polls closed" times used by news
 * desks (e.g. Florida's panhandle closes an hour after the peninsula). They're
 * used only for the "Polls close 8:00 PM ET" hint on races with no votes yet.
 */
import type { PartyCode } from "@/lib/types";

export interface StateInfo {
  postal: string;
  name: string;
  /** Last statewide poll close, ET, 24h "HH:MM". 24:00+ means after midnight. */
  pollClose: string;
  governor?: {
    party: PartyCode;
    name: string;
    /** Is this governorship on the ballot on Nov 3, 2026? */
    upIn2026: boolean;
  };
}

// prettier-ignore
export const STATES: StateInfo[] = [
  { postal: "AL", name: "Alabama",        pollClose: "20:00", governor: { party: "R", name: "Kay Ivey",                upIn2026: true } },
  { postal: "AK", name: "Alaska",         pollClose: "25:00", governor: { party: "R", name: "Mike Dunleavy",           upIn2026: true } },
  { postal: "AZ", name: "Arizona",        pollClose: "21:00", governor: { party: "D", name: "Katie Hobbs",             upIn2026: true } },
  { postal: "AR", name: "Arkansas",       pollClose: "20:30", governor: { party: "R", name: "Sarah Huckabee Sanders",  upIn2026: true } },
  { postal: "CA", name: "California",     pollClose: "23:00", governor: { party: "D", name: "Gavin Newsom",            upIn2026: true } },
  { postal: "CO", name: "Colorado",       pollClose: "21:00", governor: { party: "D", name: "Jared Polis",             upIn2026: true } },
  { postal: "CT", name: "Connecticut",    pollClose: "20:00", governor: { party: "D", name: "Ned Lamont",              upIn2026: true } },
  { postal: "DE", name: "Delaware",       pollClose: "20:00", governor: { party: "D", name: "Matt Meyer",              upIn2026: false } },
  { postal: "DC", name: "District of Columbia", pollClose: "20:00" },
  { postal: "FL", name: "Florida",        pollClose: "20:00", governor: { party: "R", name: "Ron DeSantis",            upIn2026: true } },
  { postal: "GA", name: "Georgia",        pollClose: "19:00", governor: { party: "R", name: "Brian Kemp",              upIn2026: true } },
  { postal: "HI", name: "Hawaii",         pollClose: "24:00", governor: { party: "D", name: "Josh Green",              upIn2026: true } },
  { postal: "ID", name: "Idaho",          pollClose: "23:00", governor: { party: "R", name: "Brad Little",             upIn2026: true } },
  { postal: "IL", name: "Illinois",       pollClose: "20:00", governor: { party: "D", name: "JB Pritzker",             upIn2026: true } },
  { postal: "IN", name: "Indiana",        pollClose: "19:00", governor: { party: "R", name: "Mike Braun",              upIn2026: false } },
  { postal: "IA", name: "Iowa",           pollClose: "21:00", governor: { party: "R", name: "Kim Reynolds",            upIn2026: true } },
  { postal: "KS", name: "Kansas",         pollClose: "21:00", governor: { party: "D", name: "Laura Kelly",             upIn2026: true } },
  { postal: "KY", name: "Kentucky",       pollClose: "19:00", governor: { party: "D", name: "Andy Beshear",            upIn2026: false } },
  { postal: "LA", name: "Louisiana",      pollClose: "21:00", governor: { party: "R", name: "Jeff Landry",             upIn2026: false } },
  { postal: "ME", name: "Maine",          pollClose: "20:00", governor: { party: "D", name: "Janet Mills",             upIn2026: true } },
  { postal: "MD", name: "Maryland",       pollClose: "20:00", governor: { party: "D", name: "Wes Moore",               upIn2026: true } },
  { postal: "MA", name: "Massachusetts",  pollClose: "20:00", governor: { party: "D", name: "Maura Healey",            upIn2026: true } },
  { postal: "MI", name: "Michigan",       pollClose: "21:00", governor: { party: "D", name: "Gretchen Whitmer",        upIn2026: true } },
  { postal: "MN", name: "Minnesota",      pollClose: "21:00", governor: { party: "D", name: "Tim Walz",                upIn2026: true } },
  { postal: "MS", name: "Mississippi",    pollClose: "20:00", governor: { party: "R", name: "Tate Reeves",             upIn2026: false } },
  { postal: "MO", name: "Missouri",       pollClose: "20:00", governor: { party: "R", name: "Mike Kehoe",              upIn2026: false } },
  { postal: "MT", name: "Montana",        pollClose: "22:00", governor: { party: "R", name: "Greg Gianforte",          upIn2026: false } },
  { postal: "NE", name: "Nebraska",       pollClose: "21:00", governor: { party: "R", name: "Jim Pillen",              upIn2026: true } },
  { postal: "NV", name: "Nevada",         pollClose: "22:00", governor: { party: "R", name: "Joe Lombardo",            upIn2026: true } },
  { postal: "NH", name: "New Hampshire",  pollClose: "20:00", governor: { party: "R", name: "Kelly Ayotte",            upIn2026: true } },
  { postal: "NJ", name: "New Jersey",     pollClose: "20:00", governor: { party: "D", name: "Mikie Sherrill",          upIn2026: false } },
  { postal: "NM", name: "New Mexico",     pollClose: "21:00", governor: { party: "D", name: "Michelle Lujan Grisham",  upIn2026: true } },
  { postal: "NY", name: "New York",       pollClose: "21:00", governor: { party: "D", name: "Kathy Hochul",            upIn2026: true } },
  { postal: "NC", name: "North Carolina", pollClose: "19:30", governor: { party: "D", name: "Josh Stein",              upIn2026: false } },
  { postal: "ND", name: "North Dakota",   pollClose: "22:00", governor: { party: "R", name: "Kelly Armstrong",         upIn2026: false } },
  { postal: "OH", name: "Ohio",           pollClose: "19:30", governor: { party: "R", name: "Mike DeWine",             upIn2026: true } },
  { postal: "OK", name: "Oklahoma",       pollClose: "20:00", governor: { party: "R", name: "Kevin Stitt",             upIn2026: true } },
  { postal: "OR", name: "Oregon",         pollClose: "23:00", governor: { party: "D", name: "Tina Kotek",              upIn2026: true } },
  { postal: "PA", name: "Pennsylvania",   pollClose: "20:00", governor: { party: "D", name: "Josh Shapiro",            upIn2026: true } },
  { postal: "RI", name: "Rhode Island",   pollClose: "20:00", governor: { party: "D", name: "Dan McKee",               upIn2026: true } },
  { postal: "SC", name: "South Carolina", pollClose: "19:00", governor: { party: "R", name: "Henry McMaster",          upIn2026: true } },
  { postal: "SD", name: "South Dakota",   pollClose: "21:00", governor: { party: "R", name: "Larry Rhoden",            upIn2026: true } },
  { postal: "TN", name: "Tennessee",      pollClose: "20:00", governor: { party: "R", name: "Bill Lee",                upIn2026: true } },
  { postal: "TX", name: "Texas",          pollClose: "21:00", governor: { party: "R", name: "Greg Abbott",             upIn2026: true } },
  { postal: "UT", name: "Utah",           pollClose: "22:00", governor: { party: "R", name: "Spencer Cox",             upIn2026: false } },
  { postal: "VT", name: "Vermont",        pollClose: "19:00", governor: { party: "R", name: "Phil Scott",              upIn2026: true } },
  { postal: "VA", name: "Virginia",       pollClose: "19:00", governor: { party: "D", name: "Abigail Spanberger",      upIn2026: false } },
  { postal: "WA", name: "Washington",     pollClose: "23:00", governor: { party: "D", name: "Bob Ferguson",            upIn2026: false } },
  { postal: "WV", name: "West Virginia",  pollClose: "19:30", governor: { party: "R", name: "Patrick Morrisey",        upIn2026: false } },
  { postal: "WI", name: "Wisconsin",      pollClose: "21:00", governor: { party: "D", name: "Tony Evers",              upIn2026: true } },
  { postal: "WY", name: "Wyoming",        pollClose: "21:00", governor: { party: "R", name: "Mark Gordon",             upIn2026: true } },
];

export const STATE_BY_POSTAL: Record<string, StateInfo> = Object.fromEntries(
  STATES.map((s) => [s.postal, s]),
);

/** States that redrew U.S. House maps mid-decade for 2026. "Held by" for a
 *  district number there reflects the current member, not the new lines. */
export const REDISTRICTED_2026 = new Set(["CA", "MO", "NC", "OH", "TX", "UT"]);
