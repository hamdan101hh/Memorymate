import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Loader2, Phone, Users, Activity, CheckCircle2, AlertTriangle } from "lucide-react";

export default function PatientOverview() {
  const [ov, setOv] = useState(null);
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    api.get("/patient/overview").then(({ data }) => setOv(data));
    api.get("/patient").then(({ data }) => setPatient(data));
  }, []);

  if (!ov || !patient) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const p = ov.patient;

  return (
    <div data-testid="patient-overview-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Patient Overview</h1>

      <div className="bg-white border border-stone-200 rounded-xl p-6 flex items-center gap-5">
        <span className="grid place-items-center w-20 h-20 rounded-2xl bg-sky-100 text-sky-700 font-heading text-3xl font-bold">{p.full_name?.[0]}</span>
        <div>
          <h2 className="font-heading text-2xl font-bold">{p.full_name}</h2>
          {p.age && <p className="text-stone-500">Age {p.age}</p>}
          {p.notes && <p className="text-stone-600 mt-1 text-sm">{p.notes}</p>}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 my-6">
        <Box icon={CheckCircle2} color="text-emerald-600" label="Reminders completed" value={ov.reminders_completed} />
        <Box icon={AlertTriangle} color="text-red-600" label="Reminders missed" value={ov.reminders_missed} />
        <Box icon={Activity} color="text-violet-600" label="Total memories" value={ov.total_memories} />
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <Info title="Emergency contact" icon={Phone}>
          <p className="font-medium">{p.emergency_contact_name || "—"}</p>
          <p className="text-stone-500">{p.emergency_contact_phone}</p>
        </Info>
        <Info title="Connected caregivers" icon={Users}>
          {patient.caregivers?.length ? patient.caregivers.map((c, i) => (
            <p key={c.email || `${c.full_name}-${i}`} className="text-stone-700"><span className="font-medium">{c.full_name}</span> — {c.relationship} {c.phone && `· ${c.phone}`}</p>
          )) : <p className="text-stone-400">No caregivers linked.</p>}
        </Info>
      </div>

      {ov.recent_summary && (
        <Info title="Recent AI summary" className="mt-5">
          <p className="text-stone-600">“{ov.recent_summary}”</p>
          <p className="text-xs text-stone-400 mt-2">Last activity: {ov.last_activity ? new Date(ov.last_activity).toLocaleString() : "—"}</p>
        </Info>
      )}
    </div>
  );
}

function Box({ icon: Icon, color, label, value }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <Icon className={`w-6 h-6 ${color}`} />
      <p className="mt-2 text-3xl font-bold font-heading">{value}</p>
      <p className="text-sm text-stone-500">{label}</p>
    </div>
  );
}
function Info({ title, icon: Icon, children, className = "" }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-xl p-5 ${className}`}>
      <div className="flex items-center gap-2 font-semibold mb-3">{Icon && <Icon className="w-5 h-5 text-stone-400" />} {title}</div>
      {children}
    </div>
  );
}
