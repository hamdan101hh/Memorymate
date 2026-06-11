import { useCallback, useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  CalendarClock, Plus, MapPin, Loader2, Search, ChevronDown, ChevronRight,
  MoreHorizontal, Check, Archive, CalendarPlus, Pencil, AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const empty = {
  title: "", doctor_or_clinic: "", date: "", time: "", location: "",
  notes: "", transport_notes: "", reminder_time: "1 hour before",
};

const GROUP_META = {
  urgent: { label: "Urgent", defaultOpen: true },
  today: { label: "Today", defaultOpen: true },
  tomorrow: { label: "Tomorrow", defaultOpen: true },
  this_week: { label: "This week", defaultOpen: true },
  later: { label: "Later", defaultOpen: false },
  needs_date: { label: "Needs date", defaultOpen: false },
  past: { label: "Past", defaultOpen: false },
  duplicates: { label: "Duplicates / hidden", defaultOpen: false },
  archived: { label: "Archived", defaultOpen: false },
};

const URGENCY_BORDER = {
  upcoming: "border-l-sky-400 bg-sky-50/30",
  soon: "border-l-amber-400 bg-amber-50/40",
  urgent: "border-l-rose-400 bg-rose-50/40",
  past: "border-l-stone-300 bg-stone-50/50",
  needs_date: "border-l-stone-300 bg-stone-50/40",
};

const URGENCY_BADGE = {
  Upcoming: "bg-sky-100 text-sky-800",
  Soon: "bg-amber-100 text-amber-800",
  Urgent: "bg-rose-100 text-rose-800",
  Past: "bg-stone-200 text-stone-600",
  "Needs date": "bg-stone-200 text-stone-600",
};

const FILTERS = [
  { id: "all", label: "All active" },
  { id: "urgent", label: "Urgent" },
  { id: "this_week", label: "This week" },
  { id: "not_on_google", label: "Not on Google" },
  { id: "duplicates", label: "Duplicates" },
  { id: "past", label: "Past" },
  { id: "archived", label: "Archived" },
];

function fmtWhen(a) {
  const parts = [a.date, a.time].filter(Boolean);
  return parts.join(" · ") || "No date set";
}

function ApptCard({ item, onComplete, onArchive, onEdit, onAddGoogle, onKeepDuplicate, onMarkNotDup, busy }) {
  const border = URGENCY_BORDER[item.urgency_style] || URGENCY_BORDER.upcoming;
  const badgeCls = URGENCY_BADGE[item.urgency_badge] || URGENCY_BADGE.Upcoming;
  const isDup = item.duplicate_role === "duplicate";

  return (
    <div
      className={`border border-stone-200 border-l-4 rounded-lg p-3 flex gap-3 ${border}`}
      data-testid="appt-card"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm truncate">{item.title}</h3>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
            {item.urgency_badge}
          </span>
          {item.on_google && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              On Google
            </span>
          )}
          {isDup && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Duplicate
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-0.5">{fmtWhen(item)}</p>
        {item.doctor_or_clinic && <p className="text-xs text-stone-500">{item.doctor_or_clinic}</p>}
        {item.location && (
          <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" /> {item.location}
          </p>
        )}
      </div>
      <div className="flex items-start gap-1 shrink-0">
        {!isDup && item.urgency !== "past" && (
          <Button size="sm" variant="outline" className="rounded-lg text-xs h-8" onClick={() => onComplete(item)} disabled={busy === item.id}>
            <Check className="w-3.5 h-3.5 mr-1" /> Done
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" data-testid="appt-menu">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={() => onEdit(item)}><Pencil className="w-4 h-4 mr-2" /> View / Edit</DropdownMenuItem>
            {(item.urgency === "past" || isDup) && (
              <DropdownMenuItem onClick={() => onComplete(item)} disabled={busy === item.id}>
                <Check className="w-4 h-4 mr-2" /> Mark completed
              </DropdownMenuItem>
            )}
            {!item.on_google && !isDup && (
              <DropdownMenuItem onClick={() => onAddGoogle(item)}>
                <CalendarPlus className="w-4 h-4 mr-2" /> Add to Google Calendar
              </DropdownMenuItem>
            )}
            {isDup && (
              <>
                <DropdownMenuItem onClick={() => onKeepDuplicate(item)}>Keep this one</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMarkNotDup(item)}>Mark as not duplicate</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onClick={() => onArchive(item)}>
              <Archive className="w-4 h-4 mr-2" /> {isDup ? "Archive duplicate" : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function Appointments() {
  const [dashboard, setDashboard] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(Object.entries(GROUP_META).map(([k, v]) => [k, v.defaultOpen])),
  );

  const load = useCallback(() => {
    const archived = filter === "archived" ? "?include_archived=true" : "";
    api.get(`/appointments/dashboard${archived}`).then(({ data }) => setDashboard(data)).catch(() => setDashboard(null));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      await api.post("/appointments", form);
      toast.success("Appointment added");
      setOpen(false);
      setForm(empty);
      load();
    } catch {
      toast.error("Could not add");
    } finally { setSaving(false); }
  };

  const complete = async (item) => {
    setBusy(item.id);
    try {
      await api.post(`/appointments/${item.id}/complete`);
      toast.success("Marked completed");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update");
    } finally { setBusy(""); }
  };

  const archive = async (item) => {
    setBusy(item.id);
    try {
      await api.post("/appointments/archive", { appointment_id: item.id, archive: true });
      toast.success("Archived");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not archive");
    } finally { setBusy(""); }
  };

  const keepDuplicate = async (item) => {
    setBusy(item.id);
    try {
      await api.post("/appointments/mark-not-duplicate", {
        fingerprint: item.fingerprint,
        appointment_id: item.id,
      });
      await api.patch(`/appointments/${item.id}`, { dedup_exempt: true });
      toast.success("Kept this appointment in the main list");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update");
    } finally { setBusy(""); }
  };

  const markNotDup = async (item) => {
    setBusy(item.id);
    try {
      await api.post("/appointments/mark-not-duplicate", {
        fingerprint: item.fingerprint,
        appointment_id: item.id,
      });
      toast.success("Marked as not duplicate");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update");
    } finally { setBusy(""); }
  };

  const saveEdit = async () => {
    if (!editItem) return;
    setBusy(editItem.id);
    try {
      await api.patch(`/appointments/${editItem.id}`, {
        title: editItem.title,
        doctor_or_clinic: editItem.doctor_or_clinic,
        date: editItem.date,
        time: editItem.time,
        location: editItem.location,
        notes: editItem.notes,
      });
      toast.success("Updated");
      setEditItem(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save");
    } finally { setBusy(""); }
  };

  const archiveDuplicates = async () => {
    setBusy("cleanup");
    try {
      const { data } = await api.post("/appointments/archive-duplicates");
      toast.success(`Archived ${data.archived_count} duplicate appointments`);
      setCleanupOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not archive duplicates");
    } finally { setBusy(""); }
  };

  const matchesSearch = (item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.title || "").toLowerCase().includes(q)
      || (item.location || "").toLowerCase().includes(q)
      || (item.date || "").includes(q)
    );
  };

  const filterItem = (item, groupKey) => {
    if (!matchesSearch(item)) return false;
    if (filter === "all") return groupKey !== "archived";
    if (filter === "urgent") return groupKey === "urgent";
    if (filter === "this_week") return ["today", "tomorrow", "this_week"].includes(groupKey);
    if (filter === "not_on_google") return !item.on_google && groupKey !== "duplicates" && groupKey !== "archived";
    if (filter === "duplicates") return groupKey === "duplicates";
    if (filter === "past") return groupKey === "past";
    if (filter === "archived") return groupKey === "archived";
    return true;
  };

  const grouped = useMemo(() => {
    if (!dashboard?.groups) return {};
    const out = {};
    for (const [key, items] of Object.entries(dashboard.groups)) {
      out[key] = (items || []).filter((i) => filterItem(i, key));
    }
    return out;
  }, [dashboard, filter, search]);

  const summary = dashboard?.summary;
  const hasDupes = (summary?.duplicates_hidden || 0) > 0;

  if (!dashboard) {
    return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  }

  return (
    <div data-testid="appointments-page">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Appointments</h1>
        <div className="flex flex-wrap gap-2">
          {hasDupes && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setCleanupOpen(true)} data-testid="appt-cleanup-btn">
              <Sparkles className="w-4 h-4 mr-1" /> Clean up repeated test appointments
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-appointment-btn">
                <Plus className="w-4 h-4 mr-1" /> Add appointment
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle>Add appointment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={set("title")} className="mt-1 rounded-xl" data-testid="appt-title-input" /></div>
                <div><Label>Doctor / Clinic</Label><Input value={form.doctor_or_clinic} onChange={set("doctor_or_clinic")} className="mt-1 rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date</Label><Input type="date" value={form.date} onChange={set("date")} className="mt-1 rounded-xl" /></div>
                  <div><Label>Time</Label><Input type="time" value={form.time} onChange={set("time")} className="mt-1 rounded-xl" /></div>
                </div>
                <div><Label>Location</Label><Input value={form.location} onChange={set("location")} className="mt-1 rounded-xl" /></div>
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={set("notes")} className="mt-1 rounded-xl" /></div>
              </div>
              <DialogFooter>
                <Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="appt-save-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" data-testid="appt-summary">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
          <p className="text-xs text-stone-500">Urgent</p>
          <p className="text-2xl font-semibold text-rose-700">{summary?.urgent_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
          <p className="text-xs text-stone-500">Today</p>
          <p className="text-2xl font-semibold text-sky-700">{summary?.today_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs text-stone-500">This week</p>
          <p className="text-2xl font-semibold text-amber-800">{summary?.this_week_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs text-stone-500">Needs review</p>
          <p className="text-2xl font-semibold text-stone-700">{summary?.needs_review_count ?? 0}</p>
        </div>
      </div>
      {summary?.summary_text && (
        <p className="text-sm text-stone-600 mb-4">{summary.summary_text}</p>
      )}

      {/* Search & filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search appointments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
            data-testid="appt-search"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              className={`rounded-lg text-xs h-8 ${filter === f.id ? "bg-sky-600 hover:bg-sky-700" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      {summary?.total_active === 0 && !hasDupes && filter === "all" ? (
        <EmptyState icon={CalendarClock} title="No appointments yet" message="Add an appointment to keep track of upcoming visits." testid="appointments-empty" />
      ) : (
        Object.entries(GROUP_META).map(([groupKey, meta]) => {
          const items = grouped[groupKey] || [];
          if (items.length === 0) return null;
          if (filter === "all" && groupKey === "archived") return null;
          const isOpen = openGroups[groupKey];
          return (
            <div key={groupKey} className="mb-3 border border-stone-200 rounded-xl bg-white overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left font-medium text-sm hover:bg-stone-50"
                onClick={() => setOpenGroups((o) => ({ ...o, [groupKey]: !o[groupKey] }))}
              >
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {meta.label}
                <span className="text-stone-400 font-normal">({items.length})</span>
                {groupKey === "duplicates" && summary?.duplicates_hidden > 0 && (
                  <span className="text-xs text-amber-600 ml-1">{summary.duplicates_hidden} duplicates hidden</span>
                )}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2" data-testid={`appt-group-${groupKey}`}>
                  {items.map((item) => (
                    <ApptCard
                      key={item.id}
                      item={item}
                      busy={busy}
                      onComplete={complete}
                      onArchive={archive}
                      onEdit={setEditItem}
                      onAddGoogle={() => toast.message("Open Google Calendar to add with duplicate check", {
                        action: { label: "Go", onClick: () => window.location.assign("/caregiver/calendar") },
                      })}
                      onKeepDuplicate={keepDuplicate}
                      onMarkNotDup={markNotDup}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Clean up repeated appointments?
            </DialogTitle>
            <DialogDescription>
              This will archive repeated duplicate MemoryMate-only appointments. It will not delete Google Calendar events.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupOpen(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={archiveDuplicates} disabled={busy === "cleanup"}>
              {busy === "cleanup" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Archive duplicates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Edit appointment</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <Input value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} placeholder="Title" />
              <Input value={editItem.doctor_or_clinic || ""} onChange={(e) => setEditItem({ ...editItem, doctor_or_clinic: e.target.value })} placeholder="Doctor / clinic" />
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" value={editItem.date || ""} onChange={(e) => setEditItem({ ...editItem, date: e.target.value })} />
                <Input type="time" value={editItem.time || ""} onChange={(e) => setEditItem({ ...editItem, time: e.target.value })} />
              </div>
              <Input value={editItem.location || ""} onChange={(e) => setEditItem({ ...editItem, location: e.target.value })} placeholder="Location" />
              <Textarea value={editItem.notes || ""} onChange={(e) => setEditItem({ ...editItem, notes: e.target.value })} placeholder="Notes" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button className="bg-sky-600 hover:bg-sky-700" onClick={saveEdit} disabled={busy === editItem?.id}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
