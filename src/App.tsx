import React, { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import gsap from "gsap";
import { db, useData } from "./lib/db";
import { getKey } from "./lib/keys";
import { applyTheme, reducedMotion, watchSystem } from "./lib/theme";
import { preloadNatural } from "./speech/tts";
import ErrorBoundary from "./components/ErrorBoundary";
import { Skeleton } from "./components/ui";

/** Lazy page loader that survives a flaky connection: retries once when the network comes back. */
function page<T>(load: () => Promise<T>) {
  return lazy(() => (load() as Promise<{ default: React.ComponentType }>).catch(() => new Promise((resolve, reject) => {
    const retry = () => (load() as Promise<{ default: React.ComponentType }>).then(resolve, reject);
    if (navigator.onLine) setTimeout(retry, 800);
    else addEventListener("online", retry, { once: true });
  })) as Promise<{ default: React.ComponentType }>);
}

const Home = page(() => import("./pages/Home"));
const Library = page(() => import("./pages/Library"));
const Setup = page(() => import("./pages/Setup"));
const Builder = page(() => import("./pages/Builder"));
const Call = page(() => import("./pages/Call"));
const Report = page(() => import("./pages/Report"));
const History = page(() => import("./pages/History"));
const Progress = page(() => import("./pages/Progress"));
const Settings = page(() => import("./pages/Settings"));
const Welcome = page(() => import("./pages/Welcome"));

export const APP_NAME = "SalesLab";

const NAV = [
  { to: "/", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { to: "/practice", label: "Practice", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" },
  { to: "/history", label: "History", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" },
  { to: "/progress", label: "Progress", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { to: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener("online", a); addEventListener("offline", b);
    return () => { removeEventListener("online", a); removeEventListener("offline", b); };
  }, []);
  return on;
}

function Shell({ children }: { children: ReactNode }) {
  const online = useOnline();
  const loc = useLocation();
  const main = useRef<HTMLElement>(null);
  // Page transition: a quick fade/rise on route change, focus moved to the page for screen readers.
  const firstRender = useRef(true);
  useEffect(() => {
    // Keep the first Tab for the skip link; on later navigations move focus to the new page.
    if (firstRender.current) { firstRender.current = false; return; }
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (main.current && !reducedMotion()) gsap.fromTo(main.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out", clearProps: "all" });
  }, [loc.pathname]);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3 focus:bg-surface focus:z-50">Skip to content</a>
      <aside className="hidden md:flex flex-col gap-1 p-5 border-r border-line sticky top-0 h-dvh">
        <span className="display text-2xl font-extrabold mb-6 px-3">{APP_NAME}</span>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium ${isActive ? "bg-raised text-ink" : "text-mute hover:text-ink"}`}>
              <Icon d={n.icon} />{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        {!online && <div role="status" className="bg-bad text-white text-sm text-center py-2 px-4">You're offline. Calls and grading need internet; your history is still here.</div>}
        <main id="main" ref={main} tabIndex={-1} className="w-full max-w-4xl mx-auto px-4 md:px-8 pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-10 pb-32 md:pb-12">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-5 safe-b">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium ${isActive ? "text-brass" : "text-mute"}`}>
            <Icon d={n.icon} />{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-1/2" /><Skeleton className="h-32" /><Skeleton className="h-24" />
    </div>
  );
}

function useKey() {
  const [key, setKeyState] = useState(getKey());
  useEffect(() => {
    const h = () => setKeyState(getKey());
    addEventListener("saleslab-auth", h); addEventListener("storage", h);
    return () => { removeEventListener("saleslab-auth", h); removeEventListener("storage", h); };
  }, []);
  return key;
}

export default function App() {
  const data = useData();
  const key = useKey();
  const s = data.settings;
  useEffect(() => { applyTheme(s); return watchSystem(() => applyTheme(db.settings())); }, [s]);
  // Warm up the natural voice in the background as soon as the app opens (never blocks anything).
  useEffect(() => { if (key) preloadNatural(s.voiceEngine); }, [key, s.voiceEngine]);
  useEffect(() => { db.sweepStale(); }, []);
  // Demo mode always has sample history to explore.
  useEffect(() => { if (key === "demo") void import("./lib/demo").then((m) => m.seedDemo()); }, [key]);

  const ready = Boolean(key) && s.onboarded;
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/call" element={ready ? <Call /> : <Navigate to="/welcome" replace />} />
          <Route path="*" element={ready ? (
            <Shell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/practice" element={<Library />} />
                <Route path="/practice/new" element={<Builder />} />
                <Route path="/practice/:id" element={<Setup />} />
                <Route path="/session/:id" element={<Report />} />
                <Route path="/history" element={<History />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          ) : <Navigate to="/welcome" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
