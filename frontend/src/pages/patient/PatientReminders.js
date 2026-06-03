import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Bell, Check, Clock, Plus, AlertCircle, Pill, CalendarClock, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CAT_ICON = { medication: Pill, appointment: CalendarClock, family: Users };
const PRIORITY = { high: "border-red-300 bg-red-50", medium: "border-amber-200 bg-amber-50", low: "border-stone-200 bg-white" };

export default function PatientReminders() {
  const [reminders, setReminders] = useState(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const load = () => api.get("/reminders").then(({ data }) => setReminders(data));
  useEffect(() => { load(); }, []);

  const mark = async (r, status) => {
    setReminders((rs) => rs.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try { await api.patch(`/reminders/${r.id}`, { status }); toast.success(status === "done" ? "Marked as done" : "Snoozed"); }
    catch { toast.error("Could not update"); load(); }
  };

  const add = async () => {
    if (!title.trim()) return;
    try { await api.post("/reminders", { title, category: "custom", priority: "medium" }); setTitle(""); setAdding(false); toast.success("Reminder added"); load(); }
    catch { toast.error("Could not add reminder"); }
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
        <div className="mb-5 flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What should I remind you about?" className="h-12 rounded-xl text-lg" data-testid="new-reminder-input" />
          <Button onClick={add} className="h-12 rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="new-reminder-save">Save</Button>
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
        {(r.due_time || r.description) && <p className="text-sm text-stone-500 truncate">{r.due_time} {r.description}</p>}
      </div>
      {actions}
    </div>
  );
}
