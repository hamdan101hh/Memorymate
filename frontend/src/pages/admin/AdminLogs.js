import { useEffect, useState } from "react";
import api from "../../lib/api";
import { ScrollText, Loader2 } from "lucide-react";

export default function AdminLogs() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/admin/logs").then(({ data }) => setLogs(data)); }, []);
  if (!logs) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="admin-logs-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Activity Logs</h1>
      {logs.length === 0 ? <p className="text-stone-400">No activity yet.</p> : (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {logs.map((l) => (
            <div key={l.id} className="p-4 flex items-center gap-3" data-testid="log-row">
              <ScrollText className="w-4 h-4 text-stone-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm"><span className="font-medium capitalize">{l.action.replace(/_/g, " ")}</span> {l.entity_type && <span className="text-stone-400">· {l.entity_type}</span>} {l.details && <span className="text-stone-400">· {l.details}</span>}</p>
              </div>
              <span className="text-xs text-stone-400 shrink-0">{new Date(l.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
