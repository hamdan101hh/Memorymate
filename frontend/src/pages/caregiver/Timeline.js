import { useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Clock, Users, MapPin, Pill, CalendarClock, Bell, Mic, Loader2 } from "lucide-react";

export default function Timeline() {
  const [memories, setMemories] = useState(null);
  useEffect(() => { api.get("/memories").then(({ data }) => setMemories(data)); }, []);

  if (!memories) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="timeline-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Daily Timeline</h1>
      {memories.length === 0 ? (
        <EmptyState icon={Mic} title="No memories recorded yet" testid="timeline-empty"
          message="When the patient records a memory, it will appear here with the AI summary and extracted details." />
      ) : (
        <div className="space-y-4">
          {memories.map((m) => (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="timeline-card">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold text-lg">{m.title}</h3>
                <span className="text-xs text-stone-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(m.created_at).toLocaleString()}</span>
              </div>
              <span className="inline-block mt-1 text-xs bg-stone-100 text-stone-500 rounded-full px-2 py-0.5 capitalize">{m.timeline} · {m.source}</span>
              <div className="mt-3 rounded-lg bg-sky-50 border border-sky-100 p-3 text-sm text-stone-700">{m.simple_summary}</div>
              {m.transcript && <p className="mt-2 text-xs text-stone-400 italic">“{m.transcript}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Tags icon={Bell} items={m.tasks_detected?.map((t) => t.title)} color="violet" />
                <Tags icon={Users} items={m.people_mentioned?.map((p) => p.name)} color="rose" />
                <Tags icon={MapPin} items={m.places_mentioned?.map((p) => p.name)} color="amber" />
                <Tags icon={Pill} items={m.medication_detected?.map((x) => x.name)} color="emerald" />
                <Tags icon={CalendarClock} items={m.appointment_detected?.map((a) => a.title)} color="sky" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TONE = { violet: "bg-violet-50 text-violet-700", rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700", sky: "bg-sky-50 text-sky-700" };
function Tags({ icon: Icon, items, color }) {
  if (!items || items.length === 0) return null;
  return items.map((it, i) => (
    <span key={i} className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${TONE[color]}`}><Icon className="w-3.5 h-3.5" /> {it}</span>
  ));
}
