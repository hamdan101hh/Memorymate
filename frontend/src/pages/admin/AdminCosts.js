import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { AlertTriangle, DollarSign, Loader2, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";

function statusClass(status) {
  if (status === "red") return "bg-red-100 text-red-800 border-red-200";
  if (status === "yellow") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export default function AdminCosts() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState(null);
  const [balances, setBalances] = useState(null);
  const [note, setNote] = useState("");
  const [noteAmount, setNoteAmount] = useState("");

  const load = useCallback(async () => {
    const [ov, us, bal] = await Promise.all([
      api.get("/admin/costs/overview"),
      api.get("/admin/costs/users"),
      api.get("/admin/api-balances"),
    ]);
    setOverview(ov.data);
    setUsers(us.data);
    setBalances(bal.data);
  }, []);

  useEffect(() => { load().catch(() => toast.error("Could not load cost data")); }, [load]);

  const toggleFeature = async (userId, key, current) => {
    try {
      await api.patch(`/admin/features/user/${userId}`, { [key]: !current });
      toast.success("Feature updated");
      load();
    } catch {
      toast.error("Could not update feature");
    }
  };

  const disableExpensive = async (userId) => {
    try {
      await api.patch(`/admin/features/user/${userId}`, {
        focus_capture_enabled: false,
        whatsapp_assistant_enabled: false,
        monthly_summary_enabled: false,
        cloud_transcription_enabled: false,
        paid_ai_enabled: false,
      });
      toast.success("Expensive features disabled for user");
      load();
    } catch {
      toast.error("Could not disable features");
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      const payload = { note: note.trim() };
      if (noteAmount.trim()) payload.amount_usd = parseFloat(noteAmount);
      await api.patch("/admin/api-balances/manual-topup-note", payload);
      setNote("");
      setNoteAmount("");
      toast.success("Manual top-up note saved");
      load();
    } catch {
      toast.error("Could not save note");
    }
  };

  if (!overview || !users || !balances) {
    return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  }

  const paidEnv = overview.paid_service_env_detected || {};
  const paidEnvActive = Object.entries(paidEnv).some(([, v]) => v);

  return (
    <div data-testid="admin-costs-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-2">Costs &amp; Usage</h1>
      <p className="text-stone-500 text-sm mb-6">Mock balances only — no automatic billing or top-ups.</p>

      {overview.auto_top_up_enabled && (
        <div className="mb-4 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 flex gap-2 items-start" data-testid="auto-topup-warning">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p><strong>Auto top-up is enabled in environment.</strong> Default should be disabled. Review env before launch.</p>
        </div>
      )}

      {paidEnvActive && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex gap-2 items-start" data-testid="paid-env-warning">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Paid service env vars detected (values not shown)</p>
            <ul className="text-sm mt-1 list-disc list-inside">
              {Object.entries(paidEnv).filter(([, v]) => v).map(([name]) => (
                <li key={name}>{name} is set</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <DollarSign className="w-8 h-8 text-sky-600 mb-2" />
          <p className="text-2xl font-bold">${overview.global_monthly_budget_usd}</p>
          <p className="text-sm text-stone-500">Monthly budget cap</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <p className="text-2xl font-bold">${overview.total_estimated_spend_usd}</p>
          <p className="text-sm text-stone-500">Estimated spend (month)</p>
        </div>
        <div className={`border rounded-xl p-5 ${statusClass(overview.budget_status)}`}>
          <p className="text-2xl font-bold">${overview.remaining_budget_usd}</p>
          <p className="text-sm">Remaining budget</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <Users className="w-8 h-8 text-violet-600 mb-2" />
          <p className="text-2xl font-bold">{overview.users_near_quota}</p>
          <p className="text-sm text-stone-500">Users near quota (≥80%)</p>
          <p className="text-xs text-stone-400 mt-1">{overview.users_quota_exceeded} exceeded</p>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-8">
        <h2 className="font-heading text-lg font-semibold mb-3">API balances (manual tracking)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm mb-4">
          {Object.entries(balances.api_balances || {}).map(([k, v]) => (
            <div key={k} className="bg-stone-50 rounded-lg p-3">
              <p className="text-stone-500 capitalize">{k.replace("_", " ")}</p>
              <p className="font-semibold">${Number(v).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm flex-1"
            placeholder="Manual top-up note (no secrets)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="topup-note-input"
          />
          <input
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm w-32"
            placeholder="USD (+budget)"
            value={noteAmount}
            onChange={(e) => setNoteAmount(e.target.value)}
          />
          <Button onClick={addNote} className="rounded-lg">Save note</Button>
        </div>
        {(balances.manual_top_up_notes || []).slice(-3).reverse().map((n, i) => (
          <p key={i} className="text-xs text-stone-500 mt-2">{n.at?.slice(0, 10)} — {n.note}</p>
        ))}
      </div>

      <h2 className="font-heading text-xl font-semibold mb-3">Users</h2>
      <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead>Paid AI</TableHead>
              <TableHead>Focus</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.user_id} data-testid="admin-cost-user-row">
                <TableCell>
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-xs text-stone-500">{u.email}</p>
                </TableCell>
                <TableCell className="capitalize text-sm">{u.plan}</TableCell>
                <TableCell className="text-sm">
                  ${u.total_est_usd_this_month?.toFixed(3)}
                  {u.near_quota && <span className="text-amber-600 text-xs ml-1">near</span>}
                  {u.quota_exceeded && <span className="text-red-600 text-xs ml-1">over</span>}
                </TableCell>
                <TableCell className="text-sm">${u.monthly_quota_usd}</TableCell>
                <TableCell>
                  <Switch
                    checked={u.feature_flags?.paid_ai_enabled}
                    onCheckedChange={() => toggleFeature(u.user_id, "paid_ai_enabled", u.feature_flags?.paid_ai_enabled)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.feature_flags?.focus_capture_enabled}
                    onCheckedChange={() => toggleFeature(u.user_id, "focus_capture_enabled", u.feature_flags?.focus_capture_enabled)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.feature_flags?.whatsapp_assistant_enabled}
                    onCheckedChange={() => toggleFeature(u.user_id, "whatsapp_assistant_enabled", u.feature_flags?.whatsapp_assistant_enabled)}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.feature_flags?.monthly_summary_enabled}
                    onCheckedChange={() => toggleFeature(u.user_id, "monthly_summary_enabled", u.feature_flags?.monthly_summary_enabled)}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => disableExpensive(u.user_id)}>
                    Disable all
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
