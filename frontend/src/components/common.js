import { Brain, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

// Single source of truth for support contact + legal navigation.
export const SUPPORT_EMAIL = "support@memorymate.app";

export const LEGAL_LINKS = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms" },
  { to: "/consent", label: "Consent & Recording" },
  { to: "/medical-disclaimer", label: "Medical Disclaimer" },
  { to: "/data-deletion", label: "Data Deletion" },
];

// Short legal disclaimer used on legal pages + the how-it-works page (requirement #10).
export const LEGAL_DISCLAIMER_TEXT =
  "MemoryMate is a daily-life memory support and caregiver coordination tool. It is not a medical diagnosis, treatment, or emergency service. Memory Capture is consent-based and can be paused or stopped at any time.";

export function Logo({ className = "", to = "/", onDark = false }) {
  return (
    <Link to={to} className={`flex items-center gap-2 ${className}`} data-testid="brand-logo">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-sky-600 text-white shadow-sm">
        <Brain className="w-5 h-5" strokeWidth={2.2} />
      </span>
      <span className={`font-heading font-extrabold text-xl tracking-tight ${onDark ? "text-white" : "text-stone-900"}`}>
        Memory<span className={onDark ? "text-sky-200" : "text-sky-600"}>Mate</span>
      </span>
    </Link>
  );
}

export function FullPageLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-stone-50" data-testid="loading">
      <div className="flex flex-col items-center gap-3 text-stone-500">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, message, action, testid }) {
  return (
    <div className="text-center py-14 px-6 rounded-2xl border-2 border-dashed border-stone-200 bg-white" data-testid={testid}>
      {Icon && <Icon className="w-12 h-12 mx-auto text-stone-300 mb-4" strokeWidth={1.5} />}
      <h3 className="font-heading text-lg font-semibold text-stone-800">{title}</h3>
      {message && <p className="text-stone-500 mt-1 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Disclaimer({ className = "" }) {
  return (
    <p className={`text-xs leading-relaxed text-stone-500 ${className}`} data-testid="safety-disclaimer">
      MemoryMate helps organize memories, reminders, and caregiver support. It does not diagnose, treat,
      cure, or replace professional medical advice, emergency services, or clinical care.
    </p>
  );
}

// Prominent legal disclaimer box (requirement #10) for legal + how-it-works pages.
export function LegalDisclaimer({ className = "" }) {
  return (
    <div className={`rounded-2xl bg-stone-50 border border-stone-200 p-4 flex gap-3 ${className}`} data-testid="legal-disclaimer">
      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
      <p className="text-sm text-stone-600 leading-relaxed">{LEGAL_DISCLAIMER_TEXT}</p>
    </div>
  );
}

// Reusable footer legal links. `onDark` for dark backgrounds.
export function LegalLinks({ onDark = false, className = "" }) {
  const base = onDark ? "text-stone-300 hover:text-white" : "text-stone-500 hover:text-stone-900";
  return (
    <nav className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${className}`} data-testid="legal-links">
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={base}>{l.label}</Link>
      ))}
      <a href={`mailto:${SUPPORT_EMAIL}`} className={base}>Contact</a>
    </nav>
  );
}
