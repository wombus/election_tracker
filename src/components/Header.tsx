"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { flipState } from "@/lib/analysis";
import { countdown, timeET } from "@/lib/format";
import { BallotMark, MoonIcon, RefreshIcon, SunIcon } from "./icons";
import { useNow, useResults } from "./ResultsProvider";

function RefreshStatus() {
  const { snapshot, refreshing, refresh } = useResults();
  const now = useNow(1000);
  const remaining = now === null ? null : Date.parse(snapshot.nextRefreshAt) - now;

  return (
    <div className="refresh" aria-live="off">
      <div className="refresh-text">
        <span className="refresh-line">
          <span className={`live-dot ${snapshot.rosterOnly ? "live-dot--off" : ""}`} aria-hidden="true" />
          Updated <time dateTime={snapshot.fetchedAt}>{timeET(snapshot.fetchedAt, true)}</time>
        </span>
        <span className="refresh-sub" suppressHydrationWarning>
          {refreshing ? "Checking sources…" : remaining === null ? "Auto-updates every 5 min" : remaining > 0 ? `Next update in ${countdown(remaining)}` : "Updating…"}
        </span>
      </div>
      <button type="button" className="btn btn--primary" onClick={() => refresh()} disabled={refreshing} aria-label="Update results now">
        <RefreshIcon spinning={refreshing} />
        <span>Update now</span>
      </button>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const attr = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(attr ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  }, []);
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage may be unavailable (private mode); the toggle still works for this visit */
    }
    setTheme(next);
  }
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

export function Header() {
  const pathname = usePathname();
  const { snapshot } = useResults();
  const flips = snapshot.races.filter((r) => {
    const f = flipState(r);
    return f === "flipped" || f === "trending";
  }).length;
  const called = snapshot.races.filter((r) => r.status === "called").length;

  const links = [
    { href: "/", label: "Map", count: null },
    { href: "/flips", label: "Flip Watch", count: flips },
    { href: "/called", label: "Called", count: called },
  ];

  return (
    <header className="site-head">
      <div className="site-head-inner">
        <Link href="/" className="brand" aria-label="2026 Midterms live tracker home">
          <BallotMark />
          <span className="brand-text">
            Midterms <b>2026</b>
          </span>
          <span className={`pill ${snapshot.simulated ? "pill--sim" : snapshot.rosterOnly ? "pill--off" : "pill--live"}`}>
            {snapshot.simulated ? "Simulated" : snapshot.rosterOnly ? "No feed" : "Live"}
          </span>
        </Link>
        <nav className="nav" aria-label="Views">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${pathname === l.href ? "nav-link--active" : ""}`} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
              {l.count ? <span className="nav-count">{l.count}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="head-right">
          <RefreshStatus />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
