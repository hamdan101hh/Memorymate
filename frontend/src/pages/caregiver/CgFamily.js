import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Users, UserPlus, Trash2, Loader2, Mail, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { v: "primary", l: "Primary caregiver" }, { v: "family", l: "Family member" },
  { v: "viewer", l: "Viewer" }, { v: "medical", l: "Medical / doctor" },
];
const PERMS = [
  { v: "full", l: "Full (manage everything)" }, { v: "edit", l: "Edit (add & change)" }, { v: "view", l: "View only" },
];
const empty = { email: "", full_name: "", relationship: "Family", circle_role: "family", permissions: "view" };
const labelOf = (list, v) => list.find((x) => x.v === v)?.l || v;
const PERM_STYLE = { full: "bg-emerald-100 text-emerald-700", edit: "bg-sky-100 text-sky-700", view: "bg-stone-100 text-stone-600" };

export default function CgFamily() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/family").then(({ data }) => setData(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const isAdmin = data?.my_permissions === "full";

  const invite = async () => {
    if (!form.email.trim()) { toast.error("Email is required"); return; }
    setSaving(true);
    try {
      const { data: res } = await api.post("/family/invite", form);
      toast.success(res.linked ? "Added to the family circle" : "Invite created — they'll be linked when they sign up");
      setOpen(false); setForm(empty); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Could not invite"); }
    finally { setSaving(false); }
  };
  const removeMember = async (m) => {
    try { await api.delete(`/family/${m.link_id}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Could not remove"); }
  };
  const cancelInvite = async (inv) => { await api.delete(`/family/invite/${inv.id}`); load(); };

  if (!data) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-family-page">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Family Circle</h1>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="invite-btn"><UserPlus className="w-4 h-4 mr-1" /> Invite</Button></DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle>Invite to family circle</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Email</Label><Input value={form.email} onChange={set("email")} className="mt-1 rounded-xl" placeholder="name@email.com" data-testid="invite-email-input" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name</Label><Input value={form.full_name} onChange={set("full_name")} className="mt-1 rounded-xl" placeholder="optional" /></div>
                  <div><Label>Relationship</Label><Input value={form.relationship} onChange={set("relationship")} className="mt-1 rounded-xl" placeholder="Son" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Role</Label>
                    <Select value={form.circle_role} onValueChange={set("circle_role")}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Permissions</Label>
                    <Select value={form.permissions} onValueChange={set("permissions")}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>{PERMS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={invite} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="invite-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send invite"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <p className="text-stone-600 mb-6">Everyone here can help care for the patient. Roles and permissions control what each person can do.{!isAdmin && " Only a primary caregiver can make changes."}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        {data.members.map((m) => (
          <div key={m.link_id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="family-member-card">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-11 h-11 rounded-full bg-sky-100 text-sky-700 font-bold">{(m.full_name || m.email || "?")[0]?.toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{m.full_name || m.email}{m.is_self && <span className="ml-2 text-xs text-sky-600">(you)</span>}</p>
                <p className="text-xs text-stone-500 truncate">{m.relationship} · {labelOf(ROLES, m.circle_role)}</p>
                {m.email && <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1"><Mail className="w-3 h-3" /> {m.email}</p>}
              </div>
              {isAdmin && !m.is_self && (
                <Button size="icon" variant="ghost" onClick={() => removeMember(m)} className="rounded-lg shrink-0"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 mt-3 text-xs font-medium px-2 py-1 rounded-full ${PERM_STYLE[m.permissions] || PERM_STYLE.view}`}><ShieldCheck className="w-3 h-3" /> {labelOf(PERMS, m.permissions)}</span>
          </div>
        ))}
      </div>

      {data.invites.length > 0 && (
        <>
          <h2 className="font-heading font-semibold mt-8 mb-3 flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /> Pending invites</h2>
          <div className="space-y-2">
            {data.invites.map((inv) => (
              <div key={inv.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between" data-testid="family-invite-row">
                <div>
                  <p className="font-medium">{inv.full_name || inv.email}</p>
                  <p className="text-xs text-stone-500">{inv.email} · {labelOf(ROLES, inv.circle_role)} · {labelOf(PERMS, inv.permissions)}</p>
                </div>
                {isAdmin && <Button size="sm" variant="ghost" onClick={() => cancelInvite(inv)} className="rounded-lg text-stone-500">Cancel</Button>}
              </div>
            ))}
          </div>
        </>
      )}

      {data.members.length === 0 && data.invites.length === 0 && (
        <EmptyState icon={Users} title="No one in the family circle yet" message="Invite family members so everyone can help." testid="cg-family-empty" />
      )}
    </div>
  );
}
