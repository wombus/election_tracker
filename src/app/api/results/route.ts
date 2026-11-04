/**
 * GET  /api/results  → the current snapshot (served from the 5-minute cache).
 * POST /api/results  → "Update now": refresh from the sources immediately
 *                      (throttled server-wide; see MIN_FORCED_REFRESH_SECONDS).
 *
 * GET responses may be cached briefly by a CDN to absorb traffic spikes;
 * POST is never cached, which is why the manual refresh uses it.
 */
import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60" },
  });
}

export async function POST() {
  const snapshot = await getSnapshot({ force: true });
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
