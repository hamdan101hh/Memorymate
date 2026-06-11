import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { EmptyState as CommonEmpty } from "../common";

/** Calm page header for caregiver views. */
export function PageHeader({ title, subtitle, action, disclaimer }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-stone-500 mt-1">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {disclaimer && (
        <p className="text-xs text-stone-500 mt-3 leading-relaxed max-w-3xl">{disclaimer}</p>
      )}
    </div>
  );
}

export function SummaryCard({ label, value, tone = "sky", className = "" }) {
  const tones = {
    sky: "border-sky-200 bg-sky-50/50 text-sky-800",
    rose: "border-rose-200 bg-rose-50/50 text-rose-800",
    amber: "border-amber-200 bg-amber-50/50 text-amber-900",
    stone: "border-stone-200 bg-stone-50 text-stone-700",
    emerald: "border-emerald-200 bg-emerald-50/50 text-emerald-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.sky} ${className}`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-2xl font-semibold font-heading mt-0.5">{value}</p>
    </div>
  );
}

export function StatusBadge({ children, variant = "default" }) {
  const styles = {
    default: "bg-stone-100 text-stone-700",
    new: "bg-sky-100 text-sky-800",
    urgent: "bg-rose-100 text-rose-800",
    soon: "bg-amber-100 text-amber-800",
    upcoming: "bg-sky-100 text-sky-800",
    past: "bg-stone-200 text-stone-600",
    google: "bg-emerald-100 text-emerald-800",
    duplicate: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

export function CollapsibleSection({
  title, count, defaultOpen = true, children, testId, extra,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 border border-stone-200 rounded-xl bg-white overflow-hidden" data-testid={testId}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left font-medium text-sm hover:bg-stone-50"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
        <span className="text-stone-400 font-normal">({count})</span>
        {extra}
      </button>
      {open && children && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function CompactRow({ title, sub, badges, actions, borderClass = "" }) {
  return (
    <div className={`border border-stone-200 border-l-4 rounded-lg p-3 flex gap-3 items-start ${borderClass}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm truncate">{title}</p>
          {badges}
        </div>
        {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
      </div>
      {actions && <div className="flex items-start gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

export function ViewAllLink({ to, label = "View all" }) {
  return (
    <Link to={to} className="text-sm font-medium text-sky-600 hover:text-sky-700 inline-flex items-center gap-1 mt-2">
      {label} →
    </Link>
  );
}

export function LoadingState({ label = "Loading…" }) {
  return (
    <div className="grid place-items-center py-20" data-testid="mvp-loading">
      <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
      <p className="text-sm text-stone-500 mt-2">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" data-testid="mvp-error">
      <p>{message || "Something went wrong. Please try again."}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-sky-700 font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function MvpEmpty({ icon, title, message, testid }) {
  return <CommonEmpty icon={icon} title={title} message={message} testid={testid} />;
}

export const MVP_DISCLAIMER =
  "MemoryMate helps organize memories, appointments, reminders, and caregiver coordination. It is not medical advice or emergency support.";
