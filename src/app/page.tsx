import { MapView } from "@/components/MapView";
import { STATE_BY_POSTAL } from "@/data/states";
import type { MapMode } from "@/lib/map-fills";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; view?: string }>;
}) {
  const params = await searchParams;
  const state = params.state?.toUpperCase();
  const view = params.view?.toUpperCase();
  return (
    <MapView
      initialState={state && STATE_BY_POSTAL[state] ? state : null}
      initialMode={view === "G" || view === "H" ? (view as MapMode) : "S"}
    />
  );
}
