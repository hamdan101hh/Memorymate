import { Brain, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

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
