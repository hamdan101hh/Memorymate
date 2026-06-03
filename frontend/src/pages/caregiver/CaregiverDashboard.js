import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import {
  UserRound, CheckCircle2, AlertTriangle, Bell, Pill, CalendarClock,
  Sparkles, Loader2, Clock, StickyNote, ArrowRight, Radio, Video, ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";

export default function CaregiverDashboard() {
  const [d, setD] = useState({});
  const [summary, setSummary] = useState("");
  const [gen, setGen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/patient/overview"), api.get("/reminders"), api.get("/alerts"),
      api.get("/memories"), api.get("/medications"), api.get("/appointments"), api.get("/notes"),
      api.get("/capture/sessions"), api.get("/capture/review"),
    ]).then(([ov, rem, al, mem, med, ap, nt, cap, rev]) => {
      setD({ ov: ov.data, reminders: rem.data, alerts: al.data, memories: mem.data, meds: med.data, appts: ap.data, notes: nt.data, sessions: cap.data, review: rev.data });
    });
  }, []);

  const generate = async () => {
    setGen(true);
    try { const { data } = await api.post("/caregiver/summary"); setSummary(data.summary); }
    catch { toast.error("Could not generate summary"); } finally { setGen(false); }
  };

  if (!d.ov) return <Loading />;
  const ov = d.ov;
  const missed = d.reminders.filter((r) => r.status === "missed");
  const upcoming = d.reminders.filter((r) => r.status === "pending");
  const openAlerts = d.alerts.filter((a) => a.status === "open");

  return (
    <div data-testid="caregiver-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold">Today's overview</h1>
          <p className="text-stone-500">Caring for <span className="font-medium text-stone-700">{ov.patient.full_name}</span></p>
        </div>
        <Button onClick={generate} disabled={gen} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="generate-summary-btn">
          {gen ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Generate Caregiver Summary
        </Button>
      </div>

      {summary && (
        <div className="mb-6 rounded-xl bg-sky-50 border border-sky-200 p-5" data-testid="ai-summary-card">
          <div className="flex items-center gap-2 font-semibold text-sky-800 mb-2"><Sparkles className="w-5 h-5" /> AI Caregiver Summary</div>
          <p className="whitespace-pre-wrap text-stone-700 leading-relaxed text-sm">{summary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="capture-quick-actions">
        <QuickAction to="/caregiver/capture" icon={Radio} color="bg-sky-600" label="Start capture session" />
        <QuickAction to="/caregiver/capture/sessions" icon={Video} color="bg-violet-600" label="Active sessions"
          badge={(d.sessions || []).filter((s) => ["active", "paused"].includes(s.status)).length} />
        <QuickAction to="/caregiver/capture/sessions" icon={Sparkles} color="bg-emerald-600" label="Meeting summaries"
          badge={(d.sessions || []).filter((s) => s.status === "completed").length} />
        <QuickAction to="/caregiver/capture/review" icon={ShieldQuestion} color="bg-amber-500" label="Pending privacy review"
          badge={(d.review || []).length} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon={CheckCircle2} color="emerald" label="Completed" value={ov.reminders_completed} />
        <Stat icon={Clock} color="sky" label="Pending" value={ov.reminders_pending} />
        <Stat icon={AlertTriangle} color="red" label="Missed" value={ov.reminders_missed} />
        <Stat icon={UserRound} color="violet" label="Memories" value={ov.total_memories} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Patient overview" icon={UserRound} to="/caregiver/overview">
          <p className="text-lg font-semibold">{ov.patient.full_name}{ov.patient.age ? `, ${ov.patient.age}` : ""}</p>
          <p className="text-sm text-stone-500">Emergency: {ov.patient.emergency_contact_name || "—"} {ov.patient.emergency_contact_phone}</p>
          {ov.recent_summary && <p className="mt-3 text-sm text-stone-600 bg-stone-50 rounded-lg p-3">“{ov.recent_summary}”</p>}
        </Panel>

        <Panel title="Alerts" icon={AlertTriangle} to="/caregiver/alerts" badge={openAlerts.length}>
          {openAlerts.length === 0 ? <Empty text="No active alerts." /> :
            openAlerts.slice(0, 3).map((a) => (
              <Row key={a.id} title={a.message} sub={a.alert_type} tone={a.priority === "high" ? "red" : "amber"} />
            ))}
        </Panel>

        <Panel title="Missed reminders" icon={Bell} to="/caregiver/reminders" badge={missed.length}>
          {missed.length === 0 ? <Empty text="Nothing missed. Great!" /> :
            missed.slice(0, 4).map((r) => <Row key={r.id} title={r.title} sub={`${r.due_date} ${r.due_time}`} tone="red" />)}
        </Panel>

        <Panel title="Upcoming reminders" icon={Bell} to="/caregiver/reminders">
          {upcoming.length === 0 ? <Empty text="No upcoming reminders." /> :
            upcoming.slice(0, 4).map((r) => <Row key={r.id} title={r.title} sub={`${r.due_date} ${r.due_time}`} />)}
        </Panel>

        <Panel title="Medication schedule" icon={Pill} to="/caregiver/medication">
          {d.meds.length === 0 ? <Empty text="No medications added." /> :
            d.meds.slice(0, 4).map((m) => <Row key={m.id} title={m.medication_name} sub={`${m.dosage} · ${m.time_of_day}`} />)}
        </Panel>

        <Panel title="Appointments" icon={CalendarClock} to="/caregiver/appointments">
          {d.appts.length === 0 ? <Empty text="No appointments." /> :
            d.appts.slice(0, 4).map((a) => <Row key={a.id} title={a.title} sub={`${a.date} ${a.time}`} />)}
        </Panel>

        <Panel title="Recent memories" icon={Clock} to="/caregiver/timeline">
          {d.memories.length === 0 ? <Empty text="No memories yet." /> :
            d.memories.slice(0, 3).map((m) => <Row key={m.id} title={m.title} sub={m.simple_summary} />)}
        </Panel>

        <Panel title="Caregiver notes" icon={StickyNote} to="/caregiver/notes">
          {d.notes.length === 0 ? <Empty text="No notes yet." /> :
            d.notes.slice(0, 3).map((n) => <Row key={n.id} title={n.note_text} />)}
        </Panel>
      </div>
    </div>
  );
}

const COLORS = {
  emerald: "bg-emerald-100 text-emerald-700", sky: "bg-sky-100 text-sky-700",
  red: "bg-red-100 text-red-700", violet: "bg-violet-100 text-violet-700",
};
function Stat({ icon: Icon, color, label, value }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <span className={`grid place-items-center w-10 h-10 rounded-lg ${COLORS[color]}`}><Icon className="w-5 h-5" /></span>
      <p className="mt-3 text-2xl font-bold font-heading">{value}</p>
      <p className="text-sm text-stone-500">{label}</p>
    </div>
  );
}
function Panel({ title, icon: Icon, to, badge, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-semibold"><Icon className="w-5 h-5 text-stone-400" /> {title}
          {badge > 0 && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">{badge}</span>}
        </div>
        <Link to={to} className="text-sky-600 hover:text-sky-700" aria-label="Open"><ArrowRight className="w-4 h-4" /></Link>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Row({ title, sub, tone }) {
  const dot = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-sky-500";
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {sub && <p className="text-xs text-stone-500 truncate">{sub}</p>}
      </div>
    </div>
  );
}
const Empty = ({ text }) => <p className="text-sm text-stone-400">{text}</p>;
const Loading = () => <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

function QuickAction({ to, icon: Icon, color, label, badge }) {
  return (
    <Link to={to} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-sky-300 hover:shadow-sm transition-all relative" data-testid={`quick-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className={`grid place-items-center w-10 h-10 rounded-lg text-white ${color}`}><Icon className="w-5 h-5" /></span>
      {badge > 0 && <span className="absolute top-3 right-3 bg-red-100 text-red-700 text-xs rounded-full px-2 py-0.5">{badge}</span>}
      <p className="mt-3 text-sm font-medium leading-tight">{label}</p>
    </Link>
  );
}
