import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Loader2 } from "lucide-react";

const COLLECTIONS = ["patients", "reminders", "alerts", "memories", "appointments", "medications"];

export default function AdminCollections() {
  const [active, setActive] = useState("patients");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    setRows(null);
    api.get(`/admin/collection/${active}`).then(({ data }) => setRows(data));
  }, [active]);

  const cols = rows && rows[0] ? Object.keys(rows[0]).filter((k) => !["patient_id", "created_by_user_id"].includes(k)).slice(0, 6) : [];

  return (
    <div data-testid="admin-data-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Database</h1>
      <div className="flex flex-wrap gap-2 mb-5">
        {COLLECTIONS.map((c) => (
          <Button key={c} variant={active === c ? "default" : "outline"} onClick={() => setActive(c)}
            className={`rounded-xl capitalize ${active === c ? "bg-sky-600 hover:bg-sky-700" : ""}`} data-testid={`collection-${c}`}>
            {c}
          </Button>
        ))}
      </div>

      {!rows ? <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div> :
        rows.length === 0 ? <p className="text-stone-400">No records in {active}.</p> : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>{cols.map((c) => <th key={c} className="text-left px-4 py-3 font-medium capitalize">{c.replace(/_/g, " ")}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.id} data-testid="data-row">
                    {cols.map((c) => (
                      <td key={c} className="px-4 py-3 text-stone-600 max-w-[220px] truncate">
                        {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
