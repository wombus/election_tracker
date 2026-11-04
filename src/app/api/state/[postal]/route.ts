/**
 * GET /api/state/GA → that state's district-level contests (state senate,
 * state house, councils…). Kept out of /api/results because there are
 * thousands of them nationwide; the state panel loads one state at a time.
 */
import { NextResponse } from "next/server";
import { STATE_BY_POSTAL } from "@/data/states";
import { getLocalRaces } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ postal: string }> }) {
  const postal = (await params).postal.toUpperCase();
  if (!STATE_BY_POSTAL[postal]) return NextResponse.json({ error: "Unknown state" }, { status: 404 });
  const body = await getLocalRaces(postal);
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" },
  });
}
