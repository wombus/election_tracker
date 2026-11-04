import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ResultsProvider } from "@/components/ResultsProvider";
import { SourceBanner } from "@/components/SourceBanner";
import { getSnapshot } from "@/lib/store";

// Results change minute to minute; never prerender this at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "2026 Midterms Live: Election Night Results Tracker",
  description:
    "Live 2026 U.S. midterm results: a clickable map of every Senate, House and governor race, flip watch, and called races. Updates every 5 minutes.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
  ],
};

// Applies a saved theme before first paint, so there's no light/dark flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const snapshot = await getSnapshot();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ResultsProvider initial={snapshot}>
          <a className="skip" href="#main">Skip to results</a>
          <Header />
          <SourceBanner />
          <main id="main" className="main">{children}</main>
          <Footer />
        </ResultsProvider>
      </body>
    </html>
  );
}
