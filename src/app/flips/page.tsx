import type { Metadata } from "next";
import { FlipWatch } from "@/components/FlipWatch";

export const metadata: Metadata = { title: "Flip Watch · 2026 Midterms Live" };

export default function FlipsPage() {
  return <FlipWatch />;
}
