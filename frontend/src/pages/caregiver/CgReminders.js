import { useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Bell, Plus, Check, Trash2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", description: "", category: "task", priority: "medium", due_date: "", due_time: "", repeat_rule: "none" };

export default function CgReminders() {
  const [reminders, setReminders] = useState(null);
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/reminders").then(({ data }) => setReminders(data));
  useEffect(() => { load(); }, []);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try { await api.post("/reminders", form); toast.success("Reminder added"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const update = async (r, status) => { await api.patch(`/reminders/${r.id}`, { status }); load(); };
  const remove = async (r) => { await api.delete(`/reminders/${r.id}`); load(); };

  if (!reminders) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const filtered = tab === "all" ? reminders : reminders.filter((r) => r.status === tab);

  return (
    <div data-testid="cg-reminders-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Reminders</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-reminder-btn"><Plus className="w-4 h-4 mr-1" /> Add reminder</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add reminder</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={set("title")} className="mt-1 rounded-xl" data-testid="reminder-title-input" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={set("description")} className="mt-1 rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={form.due_date} onChange={set("due_date")} className="mt-1 rounded-xl" /></div>
                <div><Label>Time</Label><Input type="time" value={form.due_time} onChange={set("due_time")} className="mt-1 rounded-xl" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Pick label="Category" value={form.category} onChange={set("category")} options={["medication", "appointment", "family", "task", "routine", "custom"]} />
                <Pick label="Priority" value={form.priority} onChange={set("priority")} options={["low", "medium", "high"]} />
                <Pick label="Repeat" value={form.repeat_rule} onChange={set("repeat_rule")} options={["none", "daily", "weekly", "monthly"]} />
              </div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="reminder-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList className="rounded-xl">
          {["all", "pending", "done", "missed"].map((t) => <TabsTrigger key={t} value={t} className="rounded-lg capitalize" data-testid={`tab-${t}`}>{t}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState icon={Bell} title="No reminders here" message="Add a reminder to help organize the day." testid="cg-reminders-empty" />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4" data-testid="cg-reminder-card">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.priority === "high" ? "bg-red-500" : r.priority === "medium" ? "bg-amber-500" : "bg-stone-300"}`} />
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${r.status === "done" ? "line-through text-stone-400" : ""}`}>{r.title}</p>
                <p className="text-xs text-stone-500">{r.due_date} {r.due_time} · {r.category} · by {r.source}</p>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${r.status === "missed" ? "bg-red-100 text-red-700" : r.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{r.status}</span>
              {r.status !== "done" && <Button size="icon" variant="ghost" onClick={() => update(r, "done")} className="rounded-lg" data-testid="cg-reminder-done"><Check className="w-4 h-4 text-emerald-600" /></Button>}
              <Button size="icon" variant="ghost" onClick={() => remove(r)} className="rounded-lg" data-testid="cg-reminder-delete"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pick({ label, value, onChange, options }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 rounded-xl capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
