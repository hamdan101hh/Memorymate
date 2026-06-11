import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Bell, Check, Clock, Plus, AlertCircle, Pill, CalendarClock, Users, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

const CAT_ICON = { medication: Pill, appointment: CalendarClock, family: Users };
const PRIORITY = { high: "border-red-300 bg-red-50", medium: "border-amber-200 bg-amber-50", low: "border-stone-200 bg-white" };

export default function PatientReminders() {
  const [reminders, setReminders] = useState(null);
  const [adding, setAdding] = useState(false);
  const [rawTitle, setRawTitle] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const load = useCallback(() => api.get("/reminders").then(({ data }) => setReminders(data)), []);
  useEffect(() => { load(); }, [load]);

  const mark = async (r, status) => {
    setReminders((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try { await api.patch(`/reminders/${r.id}`, { status }); toast.success(status === "done" ? "Marked as done" : "Snoozed"); }
    catch { toast.error("Could not update"); load(); }
  };

  const enhance = async () => {
    if (!rawTitle.trim()) return;
    setEnhancing(true);
    try {
      const { data } = await api.post("/reminders/enhance", { raw_text: rawTitle.trim() });
      setSuggestion(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not enhance");
    } finally {
      setEnhancing(false);
    }
  };

  const confirmAdd = async () => {
    const s = suggestion;
    const title = s?.suggested_title || rawTitle.trim();
    if (!title) return;
    try {
      await api.post("/reminders", {
        title,
        description: s?.enhanced_text || "",
        category: "custom",
        priority: s?.priority || "medium",
        due_date: s?.due_date || "",
        due_time: s?.due_time || "",
        repeat_rule: s?.repeat_rule || "none",
      });
      setRawTitle("");
      setSuggestion(null);
      setAdding(false);
      toast.success("Reminder added");
      load();
    } catch {
      toast.error("Could not add reminder");
    }
  };

  const addRaw = async () => {
    if (!rawTitle.trim()) return;
    try {
      await api.post("/reminders", { title: rawTitle.trim(), category: "custom", priority: "medium" });
      setRawTitle("");
      setAdding(false);
      setSuggestion(null);
      toast.success("Reminder added");
      load();
    } catch {
      toast.error("Could not add reminder");
    }
  };

  if (!reminders) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  const pending = reminders.filter((r) => r.status === "pending");
  const done = reminders.filter((r) => r.status === "done");
  const missed = reminders.filter((r) => r.status === "missed");

  return (
    <div className="mm-fade-up" data-testid="patient-reminders-page">
      <PatientPageHeader title="My Reminders" subtitle="Here is what to remember." />

      <div className="flex justify-end mb-4">
        <Button onClick={() => setAdding((a) => !a)} variant="outline" className="rounded-xl h-11" data-testid="add-reminder-toggle">
          <Plus className="w-5 h-5 mr-1" /> Add reminder
        </Button>
      </div>

      {adding && (
        <div className="mb-5 rounded-2xl border border-stone-200 bg-white p-4 space-y-3" data-testid="add-reminder-form">
          <Input value={rawTitle} onChange={(e) => setRawTitle(e.target.value)} placeholder="e.g. doctor tmrw 3" className="h-12 rounded-xl text-lg" data-testid="new-reminder-input" />
          <Button onClick={enhance} disabled={enhancing} variant="outline" className="rounded-xl" data-testid="enhance-reminder-btn">
            {enhancing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Make reminder clearer
          </Button>
          {suggestion && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 space-y-2" data-testid="reminder-suggestion">
              <p className="font-semibold">{suggestion.enhanced_text}</p>
              {(suggestion.due_date || suggestion.due_time) && (
                <p className="text-sm text-stone-600">When: {suggestion.due_date} {suggestion.due_time}</p>
              )}
              {suggestion.needs_clarification && suggestion.clarification_question && (
                <p className="text-sm text-amber-800" data-testid="reminder-clarification">{suggestion.clarification_question}</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button onClick={confirmAdd} className="rounded-xl bg-emerald-600" data-testid="confirm-reminder-btn">Confirm reminder</Button>
                <Button onClick={() => setSuggestion(null)} variant="outline" className="rounded-xl">Dismiss</Button>
              </div>
            </div>
          )}
          {!suggestion && (
            <Button onClick={addRaw} className="rounded-xl bg-sky-600" data-testid="new-reminder-save">Save as written</Button>
          )}
        </div>
      )}

      {reminders.length === 0 ? (
        <EmptyState icon={Bell} title="No reminders yet" testid="reminders-empty"
          message="Your caregiver can add one, or you can create one now." />
      ) : (
        <>
          <Group title="Upcoming" count={pending.length}>
            {pending.map((r) => (
              <ReminderCard key={r.id} r={r}
                actions={
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => mark(r, "done")} className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="reminder-done-btn"><Check className="w-4 h-4 mr-1" /> Done</Button>
                    <Button size="sm" variant="outline" onClick={() => mark(r, "missed")} className="rounded-xl" data-testid="reminder-snooze-btn"><Clock className="w-4 h-4" /></Button>
                  </div>
                } />
            ))}
            {pending.length === 0 && <p className="text-stone-500">Nothing upcoming right now.</p>}
          </Group>

          {missed.length > 0 && (
            <Group title="Missed" count={missed.length}>
              {missed.map((r) => <ReminderCard key={r.id} r={r} actions={<Button size="sm" onClick={() => mark(r, "done")} className="rounded-xl bg-emerald-600 hover:bg-emerald-700"><Check className="w-4 h-4 mr-1" /> Done</Button>} />)}
            </Group>
          )}

          {done.length > 0 && (
            <Group title="Completed" count={done.length}>
              {done.map((r) => <ReminderCard key={r.id} r={r} muted />)}
            </Group>
          )}
        </>
      )}

      <p className="mt-8 text-center text-stone-500">
        Need help? <Link to="/patient/emergency" className="text-sky-700 font-medium">Ask your caregiver</Link>
      </p>
    </div>
  );
}

function Group({ title, count, children }) {
  return (
    <div className="mb-7">
      <h2 className="font-heading text-xl font-semibold mb-3">{title} <span className="text-stone-400 text-base">({count})</span></h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ReminderCard({ r, actions, muted }) {
  const Icon = CAT_ICON[r.category] || Bell;
  return (
    <div className={`rounded-2xl border-2 p-4 flex items-center gap-4 ${muted ? "border-stone-200 bg-stone-50 opacity-70" : PRIORITY[r.priority] || PRIORITY.low}`} data-testid="reminder-card">
      <span className="grid place-items-center w-12 h-12 rounded-xl bg-white shadow-sm shrink-0">
        {r.status === "missed" ? <AlertCircle className="w-6 h-6 text-red-500" /> : <Icon className="w-6 h-6 text-stone-600" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-lg font-semibold ${muted ? "line-through text-stone-400" : ""}`}>{r.title}</p>
        {(r.due_time || r.description) && <p className="text-sm text-stone-500 truncate">{r.due_date} {r.due_time} {r.description}</p>}
      </div>
      {actions}
    </div>
  );
}
