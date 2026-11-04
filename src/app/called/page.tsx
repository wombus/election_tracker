import type { Metadata } from "next";
import { CalledRaces } from "@/components/CalledRaces";

export const metadata: Metadata = { title: "Called Races · 2026 Midterms Live" };

export default function CalledPage() {
  return <CalledRaces />;
}
