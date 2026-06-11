import { useEffect, useState, useCallback, useMemo } from "react";
import api from "../../lib/api";
import {
  PageHeader, SummaryCard, CollapsibleSection, CompactRow, StatusBadge, MvpEmpty, LoadingState, MVP_DISCLAIMER,
} from "../../components/mvp";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Bell, Plus, Check, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", description: "", category: "task", priority: "medium", due_date: "", due_time: "", repeat_rule: "none" };

function reminderBucket(r, todayStr, tomorrowStr, weekEndStr) {
  if (r.status === "done") return "completed";
  const d = r.due_date || "";
  if (r.status === "missed" || (d && d < todayStr && r.status === "pending")) return "overdue";
  if (d === todayStr) return "today";
  if (d === tomorrowStr) return "tomorrow";
  if (d && d <= weekEndStr) return "this_week";
  if (d) return "later";
  return "later";
}

function urgencyVariant(bucket) {
  if (bucket === "overdue") return "urgent";
  if (bucket === "today" || bucket === "tomorrow") return "soon";
  if (bucket === "this_week") return "upcoming";
  return "default";
}

export default function CgReminders() {
  const [reminders, setReminders] = useState(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/reminders").then(({ data }) => setReminders(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      await api.post("/reminders", form);
      toast.success("Reminder added");
      setOpen(false);
      setForm(empty);
      load();
    } catch {
      toast.error("Could not add");
    } finally {
      setSaving(false);
    }
  };
  const update = async (r, status) => { await api.patch(`/reminders/${r.id}`, { status }); load(); };
  const remove = async (r) => { await api.delete(`/reminders/${r.id}`); load(); };

  const buckets = useMemo(() => {
    if (!reminders) return null;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? reminders.filter((r) => r.title?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q))
      : reminders;

    const groups = { overdue: [], today: [], tomorrow: [], this_week: [], later: [], completed: [] };
    filtered.forEach((r) => {
      const b = reminderBucket(r, todayStr, tomorrowStr, weekEndStr);
      groups[b].push(r);
    });
    return { groups, todayStr, counts: {
      today: groups.today.length,
      overdue: groups.overdue.length,
      upcoming: groups.tomorrow.length + groups.this_week.length + groups.later.length,
    } };
  }, [reminders, search]);

  if (!reminders || !buckets) return <LoadingState />;

  const { groups, counts } = buckets;
  const totalActive = groups.overdue.length + groups.today.length + groups.tomorrow.length
    + groups.this_week.length + groups.later.length;

  const renderGroup = (key, title, defaultOpen = true) => {
    const items = groups[key];
    if (!items.length) return null;
    return (
      <CollapsibleSection title={title} count={items.length} defaultOpen={defaultOpen} testId={`rem-group-${key}`}>
        <div className="space-y-2">
          {items.map((r) => (
            <ReminderRow key={r.id} r={r} bucket={key} onDone={() => update(r, "done")} onRemove={() => remove(r)} />
          ))}
        </div>
      </CollapsibleSection>
    );
  };

  return (
    <div data-testid="cg-reminders-page">
      <PageHeader
        title="Reminders"
        subtitle="Tasks and medication reminders for your patient."
        disclaimer={MVP_DISCLAIMER}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-reminder-btn">
                <Plus className="w-4 h-4 mr-1" /> Add reminder
              </Button>
            </DialogTrigger>
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
              <DialogFooter>
                <Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="reminder-save-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryCard label="Due today" value={counts.today} tone="amber" />
        <SummaryCard label="Overdue" value={counts.overdue} tone="rose" />
        <SummaryCard label="Upcoming" value={counts.upcoming} tone="sky" />
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reminders…" className="pl-9 rounded-xl" />
      </div>

      {totalActive === 0 && groups.completed.length === 0 ? (
        <MvpEmpty icon={Bell} title="No reminders yet" message="No reminders due today. Add a reminder to help organize the day." testid="cg-reminders-empty" />
      ) : (
        <>
          {renderGroup("overdue", "Overdue", true)}
          {renderGroup("today", "Today", true)}
          {renderGroup("tomorrow", "Tomorrow", true)}
          {renderGroup("this_week", "This week", true)}
          {renderGroup("later", "Later", false)}
          {renderGroup("completed", "Completed", false)}
        </>
      )}
    </div>
  );
}

function ReminderRow({ r, bucket, onDone, onRemove }) {
  const variant = urgencyVariant(bucket);
  const border = variant === "urgent" ? "border-l-rose-500" : variant === "soon" ? "border-l-amber-400" : variant === "upcoming" ? "border-l-sky-400" : "border-l-stone-200";
  return (
    <CompactRow
      title={r.title}
      sub={`${r.due_date || "—"} ${r.due_time || ""} · ${r.category}`}
      borderClass={border}
      badges={
        <>
          <StatusBadge variant={variant}>{r.status}</StatusBadge>
          {r.priority === "high" && <StatusBadge variant="urgent">High</StatusBadge>}
        </>
      }
      actions={
        <>
          {r.status !== "done" && (
            <Button size="icon" variant="ghost" onClick={onDone} className="rounded-lg h-8 w-8" data-testid="cg-reminder-done">
              <Check className="w-4 h-4 text-emerald-600" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onRemove} className="rounded-lg h-8 w-8" data-testid="cg-reminder-delete">
            <Trash2 className="w-4 h-4 text-stone-400" />
          </Button>
        </>
      }
    />
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
