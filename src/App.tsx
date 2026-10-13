import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { configured } from "./lib/supabase";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import SessionReport from "./pages/SessionReport";
import Settings from "./pages/Settings";

const Practice = lazy(() => import("./pages/Practice"));

export const APP_NAME = "SalesLab";

function Guard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-mute">Loading...</div>;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <Shell>{children}</Shell>;
}

const NAV = [
  { to: "/home", label: "Home" },
  { to: "/practice", label: "Practice" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh safe flex flex-col">
      <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-line">
        <span className="font-display text-2xl">{APP_NAME}</span>
        <nav className="flex gap-6 text-sm">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "text-gold" : "text-mute hover:text-paper")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-8 py-6 pb-28 md:pb-10">{children}</main>
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 bg-panel/95 backdrop-blur border-t border-line grid grid-cols-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `py-4 text-center text-sm ${isActive ? "text-gold" : "text-mute"}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  if (!configured)
    return (
      <div className="p-8 max-w-lg mx-auto">
        <h1 className="font-display text-3xl mb-3">Setup needed</h1>
        <p className="text-mute">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart. See README.</p>
      </div>
    );
  return (
    <AuthProvider>
      <Suspense fallback={<div className="p-8 text-mute">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Guard><Dashboard /></Guard>} />
          <Route path="/practice" element={<Guard><Practice /></Guard>} />
          <Route path="/history" element={<Guard><History /></Guard>} />
          <Route path="/session/:id" element={<Guard><SessionReport /></Guard>} />
          <Route path="/settings" element={<Guard><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
