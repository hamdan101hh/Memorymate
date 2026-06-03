import { useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2, BellRing } from "lucide-react";
import { toast } from "sonner";

const TONE = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-stone-200 bg-stone-50 text-stone-600",
};

export default function Alerts() {
  const [alerts, setAlerts] = useState(null);
  const load = () => api.get("/alerts").then(({ data }) => setAlerts(data));
  useEffect(() => { load(); }, []);

  const resolve = async (a) => {
    try { await api.patch(`/alerts/${a.id}/resolve`); toast.success("Alert resolved"); load(); }
    catch { toast.error("Could not resolve"); }
  };

  if (!alerts) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const open = alerts.filter((a) => a.status === "open");
  const resolved = alerts.filter((a) => a.status === "resolved");

  return (
    <div data-testid="alerts-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Alerts</h1>
      {alerts.length === 0 ? (
        <EmptyState icon={BellRing} title="No alerts" message="Alerts about missed reminders, medication or appointments will show here." testid="alerts-empty" />
      ) : (
        <>
          <h2 className="font-semibold text-stone-600 mb-3">Active ({open.length})</h2>
          <div className="space-y-3 mb-8">
            {open.length === 0 ? <p className="text-stone-400 text-sm">No active alerts.</p> : open.map((a) => (
              <div key={a.id} className={`border-2 rounded-xl p-4 flex items-center gap-3 ${TONE[a.priority]}`} data-testid="alert-card">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-800">{a.message}</p>
                  <p className="text-xs capitalize">{a.alert_type.replace(/_/g, " ")} · {a.priority} · {new Date(a.created_at).toLocaleString()}</p>
                </div>
                <Button size="sm" onClick={() => resolve(a)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="resolve-alert-btn"><CheckCircle2 className="w-4 h-4 mr-1" /> Resolve</Button>
              </div>
            ))}
          </div>

          {resolved.length > 0 && (
            <>
              <h2 className="font-semibold text-stone-600 mb-3">Resolved ({resolved.length})</h2>
              <div className="space-y-2">
                {resolved.map((a) => (
                  <div key={a.id} className="border border-stone-200 rounded-xl p-3 flex items-center gap-3 opacity-70">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-stone-600 flex-1 min-w-0 truncate">{a.message}</p>
                    <span className="text-xs text-stone-400">{a.resolved_at && new Date(a.resolved_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
