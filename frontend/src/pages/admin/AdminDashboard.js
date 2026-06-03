import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Users, UserRound, HeartHandshake, Mic, Bell, AlertTriangle, Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/stats").then(({ data }) => setS(data)); }, []);
  if (!s) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  const stats = [
    { icon: Users, label: "Total users", value: s.total_users, color: "sky" },
    { icon: UserRound, label: "Patients", value: s.total_patients, color: "violet" },
    { icon: HeartHandshake, label: "Caregivers", value: s.total_caregivers, color: "emerald" },
    { icon: Mic, label: "Memory entries", value: s.total_memories, color: "amber" },
    { icon: Bell, label: "Reminders", value: s.total_reminders, color: "rose" },
    { icon: AlertTriangle, label: "Alerts", value: s.total_alerts, color: "red" },
  ];
  const C = { sky: "bg-sky-100 text-sky-700", violet: "bg-violet-100 text-violet-700", emerald: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", rose: "bg-rose-100 text-rose-700", red: "bg-red-100 text-red-700" };

  return (
    <div data-testid="admin-dashboard">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">System Overview</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((st) => (
          <div key={st.label} className="bg-white border border-stone-200 rounded-xl p-5" data-testid={`stat-${st.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <span className={`grid place-items-center w-10 h-10 rounded-lg ${C[st.color]}`}><st.icon className="w-5 h-5" /></span>
            <p className="mt-3 text-3xl font-bold font-heading">{st.value}</p>
            <p className="text-sm text-stone-500">{st.label}</p>
          </div>
        ))}
      </div>

      <h2 className="font-heading text-xl font-semibold mb-3">Recent signups</h2>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
        {s.recent_signups.map((u) => (
          <div key={u.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{u.full_name}</p>
              <p className="text-xs text-stone-500">{u.email}</p>
            </div>
            <span className="text-xs bg-stone-100 text-stone-600 rounded-full px-2.5 py-1 capitalize">{u.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
