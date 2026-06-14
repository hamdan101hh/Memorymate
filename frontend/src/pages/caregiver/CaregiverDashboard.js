import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { getCaregiverDashboardCopy } from "../../lib/purposeConfig";
import { Button } from "../../components/ui/button";
import NotificationPermissionPrompt from "../../components/NotificationPermissionPrompt";
import QuickNoteCard from "../../components/caregiver/QuickNoteCard";
import MemoryVisualTile from "../../components/caregiver/MemoryVisualTile";
import {
  PageHeader, SummaryCard, CompactRow, ViewAllLink, LoadingState, MVP_DISCLAIMER, StatusBadge,
} from "../../components/mvp";
import {
  CalendarClock, Bell, ShieldQuestion, Sparkles, Loader2, StickyNote, Plus, Radio,
  CalendarDays, Copy,
} from "lucide-react";
import { toast } from "sonner";

const TOP_ACTIONS = [
  { key: "ai", to: "/caregiver/appointments", icon: Sparkles, label: "Create with AI" },
  { key: "reminder", to: "/caregiver/reminders", icon: Plus, label: "Add reminder" },
  { key: "quicknote", scroll: "quick-note-card", icon: StickyNote, label: "Add quick note" },
  { key: "calendar", to: "/caregiver/calendar", icon: CalendarDays, label: "Open calendar" },
  { key: "duplicates", to: "/caregiver/appointments?filter=duplicates", icon: Copy, label: "Review duplicates", badgeKey: "dup" },
  { key: "memory", to: "/caregiver/capture", icon: Radio, label: "Record memory" },
];

export default function CaregiverDashboard() {
  const { user } = useAuth();
  const [ov, setOv] = useState(null);
  const [apptDash, setApptDash] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [memories, setMemories] = useState([]);
  const [review, setReview] = useState([]);
  const [calStatus, setCalStatus] = useState(null);
  const [summary, setSummary] = useState("");
  const [gen, setGen] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.get("/patient/overview"),
      api.get("/appointments/dashboard"),
      api.get("/reminders"),
      api.get("/memories"),
      api.get("/capture/review"),
      api.get("/calendar/status"),
    ]).then(([ovRes, dashRes, remRes, memRes, revRes, calRes]) => {
      setOv(ovRes.data);
      setApptDash(dashRes.data);
      setReminders(remRes.data);
      setMemories(memRes.data);
      setReview(revRes.data);
      setCalStatus(calRes.data);
    }).catch(() => toast.error("Could not load dashboard"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGen(true);
    try {
      const { data } = await api.post("/caregiver/summary");
      setSummary(data.summary);
    } catch {
      toast.error("Could not generate summary");
    } finally {
      setGen(false);
    }
  };

  const scrollToQuickNote = () => {
    const el = document.getElementById("quick-note-card");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el?.querySelector("textarea");
    input?.focus();
  };

  const dashCopy = getCaregiverDashboardCopy(user?.memorymate_purpose, user?.role, user?.memorymate_mode);
  const mode = user?.memorymate_mode;

  if (!ov || !apptDash) return <LoadingState />;

  const supportedName = ov.patient?.full_name || "the person you support";
  const today = new Date().toISOString().slice(0, 10);
  const todayReminders = reminders.filter((r) => r.due_date === today && r.status === "pending");
  const urgentAppts = apptDash.groups?.urgent || [];
  const todayAppts = apptDash.groups?.today || [];
  const dupCount = apptDash.summary?.duplicates_hidden || 0;
  const needsReview = (review || []).length;
  const calConnected = calStatus?.connected;

  const priorities = [
    ...urgentAppts.slice(0, 2).map((a) => ({
      key: a.id, title: a.title, sub: `${a.date || "—"} ${a.time || ""}`, tone: "border-l-rose-500", badge: "urgent",
    })),
    ...todayReminders.slice(0, 2).map((r) => ({
      key: r.id, title: r.title, sub: `${r.due_date} ${r.due_time}`, tone: "border-l-amber-400", badge: "soon",
    })),
  ].slice(0, 5);

  const upcoming = [
    ...todayAppts,
    ...(apptDash.groups?.tomorrow || []).slice(0, 2),
    ...(apptDash.groups?.this_week || []).slice(0, 2),
  ].slice(0, 5);

  return (
    <div data-testid="caregiver-dashboard">
      <PageHeader
        title={dashCopy.title}
        subtitle={`Supporting ${supportedName}`}
        disclaimer={MVP_DISCLAIMER}
        action={
          <Button onClick={generate} disabled={gen} variant="outline" className="rounded-xl" data-testid="generate-summary-btn">
            {gen ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Summary
          </Button>
        }
      />

      {mode === "trusted_supporter" && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="trusted-supporter-invite-cta">
          <p className="text-sm text-stone-700">
            Invite a trusted supporter to Family circle — optional, and you control what they see.
          </p>
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link to="/caregiver/family">Open Family circle</Link>
          </Button>
        </div>
      )}
      {mode === "private_executive" && (
        <p className="mb-4 text-sm text-stone-600" data-testid="private-mode-note">
          Private mode — focused on your meetings, reminders, and notes.
        </p>
      )}

      {/* Top: quick note + quick actions */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4" data-testid="dashboard-top-actions">
        <div id="quick-note-card">
          <QuickNoteCard onSaved={load} />
        </div>
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-semibold text-sm mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TOP_ACTIONS.map((a) => {
              const badge = a.badgeKey === "dup" ? dupCount : null;
              if (a.scroll) {
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={scrollToQuickNote}
                    className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 p-3 min-h-[72px] hover:border-sky-300 hover:bg-sky-50/50 transition-colors text-center"
                    data-testid={`quick-action-${a.key}`}
                  >
                    <a.icon className="w-5 h-5 text-sky-600" />
                    <span className="text-xs font-medium leading-tight">{a.label}</span>
                  </button>
                );
              }
              return (
                <Link
                  key={a.key}
                  to={a.to}
                  className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 p-3 min-h-[72px] hover:border-sky-300 hover:bg-sky-50/50 transition-colors text-center relative"
                  data-testid={`quick-action-${a.key}`}
                >
                  {badge > 0 && (
                    <span className="absolute top-2 right-2 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5">{badge}</span>
                  )}
                  <a.icon className="w-5 h-5 text-sky-600" />
                  <span className="text-xs font-medium leading-tight">{a.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <NotificationPermissionPrompt settingsPath="/caregiver/notifications" />

      {summary && (
        <div className="mb-4 rounded-xl bg-sky-50 border border-sky-200 p-4" data-testid="ai-summary-card">
          <p className="font-semibold text-sky-800 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Caregiver summary</p>
          <p className="whitespace-pre-wrap text-stone-700 text-sm leading-relaxed">{summary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="today-overview-row">
        <SummaryCard label="Urgent" value={apptDash.summary?.urgent_count || 0} tone="rose" />
        <SummaryCard label="Today" value={(apptDash.summary?.today_count || 0) + todayReminders.length} tone="amber" />
        <SummaryCard label="Needs review" value={needsReview + (apptDash.summary?.needs_review_count || 0)} tone="stone" />
        <SummaryCard label="Calendar" value={calConnected ? "Connected" : "Not linked"} tone={calConnected ? "emerald" : "stone"} />
      </div>

      {dupCount > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="dup-notice">
          <span className="text-amber-900">{dupCount} duplicate appointment{dupCount !== 1 ? "s" : ""} hidden.</span>
          <Link to="/caregiver/appointments" className="font-medium text-sky-700">Review →</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Bell className="w-4 h-4 text-stone-400" /> Today&apos;s priorities</h2>
          {priorities.length === 0 ? (
            <p className="text-sm text-stone-400">Nothing urgent right now.</p>
          ) : (
            <div className="space-y-2">
              {priorities.map((p) => (
                <CompactRow
                  key={p.key}
                  title={p.title}
                  sub={p.sub}
                  borderClass={p.tone}
                  badges={<StatusBadge variant={p.badge}>{p.badge === "urgent" ? "Urgent" : "Today"}</StatusBadge>}
                />
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-stone-200 rounded-xl p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-stone-400" /> Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-stone-400">No upcoming appointments.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((a) => (
                <CompactRow key={a.id} title={a.title} sub={`${a.date || "—"} ${a.time || ""}`} borderClass="border-l-sky-400" />
              ))}
            </div>
          )}
          <ViewAllLink to="/caregiver/appointments" />
        </section>

        <section className="bg-white border border-stone-200 rounded-xl p-4 lg:col-span-2">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-stone-400" /> Recent memories</h2>
          {memories.length === 0 ? (
            <p className="text-sm text-stone-400">No memories yet. Record a memory or add a quick note.</p>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              {memories.slice(0, 3).map((m) => (
                <div key={m.id} className="flex gap-3 rounded-lg border border-stone-100 p-2" data-testid="dashboard-memory-tile">
                  <MemoryVisualTile memory={m} compact />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-stone-500 line-clamp-2">{m.simple_summary}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ViewAllLink to="/caregiver/timeline" label="View timeline" />
        </section>
      </div>

      <section className="bg-white border border-stone-200 rounded-xl p-4 mb-2" data-testid="privacy-review-section">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><ShieldQuestion className="w-4 h-4 text-stone-400" /> Privacy review</h2>
        {needsReview === 0 ? (
          <p className="text-sm text-stone-400">Nothing needs review.</p>
        ) : (
          <div className="space-y-2">
            {review.slice(0, 3).map((r) => (
              <CompactRow key={r.id} title={r.title || "Memory capture"} sub={r.reason || "Pending review"} borderClass="border-l-amber-400" />
            ))}
          </div>
        )}
        <ViewAllLink to="/caregiver/capture/review" />
      </section>
    </div>
  );
}
