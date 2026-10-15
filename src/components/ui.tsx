import { useEffect, useRef, type ReactNode } from "react";

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="tip inline-flex">{children}<span role="tooltip">{label}</span></span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel p-8 text-center flex flex-col items-center gap-3">
      <h2 className="text-2xl">{title}</h2>
      <p className="text-mute max-w-sm">{body}</p>
      {action}
    </div>
  );
}

/** Accessible modal: focus moves in, Esc closes, focus returns. */
export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("button, [href], input, select, textarea");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && ref.current) {
        const els = [...ref.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter((x) => !x.hasAttribute("disabled"));
        if (!els.length) return;
        const a = els[0], b = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel w-full max-w-md p-6 flex flex-col gap-4 safe-b">
        <h2 className="text-2xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 min-h-12 cursor-pointer">
      <span><span className="block">{label}</span>{desc && <span className="block text-sm text-mute">{desc}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${checked ? "bg-brass" : "bg-line"}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-surface transition-transform ${checked ? "translate-x-5" : ""}`} />
        <span className="sr-only">{label}</span>
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="chip" onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
