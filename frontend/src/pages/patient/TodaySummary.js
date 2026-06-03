import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Sunrise, Sun, Moon, Users, MapPin, Bell, Pill, StickyNote, CalendarClock, Mic, Loader2 } from "lucide-react";

const BUCKETS = [
  { key: "morning", label: "Morning", icon: Sunrise, color: "text-amber-500" },
  { key: "afternoon", label: "Afternoon", icon: Sun, color: "text-sky-500" },
  { key: "evening", label: "Evening", icon: Moon, color: "text-violet-500" },
];

export default function TodaySummary() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/summary/today").then(({ data }) => setData(data)); }, []);

  if (!data) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  const today = new Date(data.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mm-fade-up" data-testid="today-summary-page">
      <PatientPageHeader title="Today's Summary" subtitle={today} />

      {!data.has_data && data.notes.length === 0 && data.reminders_today.length === 0 && (
        <EmptyState icon={Mic} title="No memories saved yet today" testid="today-empty"
          message="Record a memory whenever you are ready and it will appear here."
          action={<Link to="/patient/record"><Button className="rounded-2xl bg-sky-600 hover:bg-sky-700 h-12">Record a memory</Button></Link>} />
      )}

      <div className="space-y-5">
        {BUCKETS.map((b) => {
          const items = data.timeline[b.key] || [];
          if (items.length === 0) return null;
          return (
            <div key={b.key} className="rounded-3xl bg-white border-2 border-stone-200 p-6">
              <div className={`flex items-center gap-2 font-heading text-xl font-semibold ${b.color}`}><b.icon className="w-6 h-6" /> {b.label}</div>
              <div className="mt-4 space-y-3">
                {items.map((m) => (
                  <div key={m.id} className="text-lg text-stone-700 leading-relaxed border-l-4 border-stone-100 pl-4">
                    <p className="font-semibold text-stone-900">{m.title}</p>
                    <p>{m.simple_summary}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Section title="Reminders for today" icon={Bell} color="text-violet-600" show={data.reminders_today.length > 0}>
        {data.reminders_today.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2">
            <span>{r.title}</span>
            <span className="text-sm text-stone-400">{r.due_time}</span>
          </li>
        ))}
      </Section>

      <Section title="Notes from your family" icon={StickyNote} color="text-emerald-600" show={data.notes.length > 0}>
        {data.notes.map((n) => <li key={n.id}>{n.note_text}</li>)}
      </Section>

      <Section title="Appointments" icon={CalendarClock} color="text-sky-600" show={data.appointments.length > 0}>
        {data.appointments.map((a) => <li key={a.id}>{a.title} — {a.date} {a.time}</li>)}
      </Section>

      <Section title="People you mentioned" icon={Users} color="text-rose-500" show={data.people.length > 0}>
        {data.people.map((p, i) => <li key={i}>{p.name}{p.relationship ? ` (${p.relationship})` : ""}</li>)}
      </Section>

      <Section title="Places mentioned" icon={MapPin} color="text-amber-600" show={data.places.length > 0}>
        {data.places.map((p, i) => <li key={i}>{p.name}</li>)}
      </Section>

      <Section title="Medication notes" icon={Pill} color="text-emerald-600" show={data.medications.length > 0}>
        {data.medications.map((m, i) => <li key={i}>{m.name}{m.instruction ? ` — ${m.instruction}` : ""}</li>)}
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, color, show, children }) {
  if (!show) return null;
  return (
    <div className="mt-5 rounded-3xl bg-white border-2 border-stone-200 p-6">
      <div className={`flex items-center gap-2 font-heading text-xl font-semibold ${color}`}><Icon className="w-6 h-6" /> {title}</div>
      <ul className="mt-3 space-y-2 text-lg text-stone-700">{children}</ul>
    </div>
  );
}
