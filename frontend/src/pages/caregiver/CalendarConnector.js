import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  CalendarDays, CheckCircle2, AlertTriangle, Loader2, Link2, Unlink,
  CalendarPlus, Download, MapPin, RefreshCw, ShieldCheck, History, Lock, Sparkles,
  ChevronDown, ChevronRight, Eye, EyeOff, XCircle, Check, Search,
} from "lucide-react";
import { toast } from "sonner";
import CreateEventWithAI from "./CreateEventWithAI";

const ACTIVITY_LABELS = {
  connected: { label: "Connected Google Calendar", icon: Link2, color: "text-emerald-600" },
  disconnected: { label: "Disconnected Google Calendar", icon: Unlink, color: "text-stone-500" },
  imported: { label: "Imported event", icon: Download, color: "text-sky-600" },
  added: { label: "Added appointment to Google Calendar", icon: CalendarPlus, color: "text-sky-600" },
  created_ai: { label: "Created AI-drafted event", icon: Sparkles, color: "text-sky-600" },
  reconnect_needed: { label: "Reconnect needed (access expired)", icon: AlertTriangle, color: "text-amber-600" },
  hidden_suggestion: { label: "Hidden suggestion", icon: EyeOff, color: "text-stone-500" },
  handled_suggestion: { label: "Marked suggestion as handled", icon: Check, color: "text-stone-500" },
  archived_appointment: { label: "Archived appointment from list", icon: XCircle, color: "text-stone-500" },
};

const BADGE_STYLES = {
  new: "bg-sky-100 text-sky-800",
  imported: "bg-emerald-100 text-emerald-800",
  possible_duplicate: "bg-amber-100 text-amber-800",
  hidden: "bg-stone-100 text-stone-600",
  handled: "bg-stone-100 text-stone-600",
  not_on_google: "bg-violet-100 text-violet-800",
  added_to_google: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
};

const GROUP_META = {
  today: { label: "Today", defaultOpen: true },
  tomorrow: { label: "Tomorrow", defaultOpen: true },
  this_week: { label: "This week", defaultOpen: true },
  later: { label: "Later", defaultOpen: false },
  imported: { label: "Already imported", defaultOpen: false },
  duplicates: { label: "Possible duplicates / needs review", defaultOpen: true },
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New suggestions" },
  { id: "duplicates", label: "Duplicates" },
  { id: "imported", label: "Already imported" },
  { id: "not_on_google", label: "Not on Google" },
  { id: "hidden", label: "Hidden" },
];

function fmtActivityTime(s) {
  try { return new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return s; }
}

function fmtWhen(item) {
  const parts = [];
  if (item.date) {
    try {
      const d = new Date(item.date + "T12:00:00");
      parts.push(d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
    } catch { parts.push(item.date); }
  }
  if (item.time) parts.push(item.time);
  return parts.join(" · ");
}

function badgeLabel(badge) {
  const map = {
    new: "New",
    imported: "Imported",
    possible_duplicate: "Possible duplicate",
    hidden: "Hidden",
    handled: "Handled",
    not_on_google: "Not on Google",
    added_to_google: "Added to Google",
    needs_review: "Needs review",
  };
  return map[badge] || badge;
}

function StatusBadge({ badge }) {
  if (!badge) return null;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${BADGE_STYLES[badge] || BADGE_STYLES.new}`}>
      {badgeLabel(badge)}
    </span>
  );
}

function CompactCard({ item, actions, testid }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 flex gap-3 items-start" data-testid={testid}>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="font-medium text-sm truncate">{item.title}</p>
          <StatusBadge badge={item.badge} />
        </div>
        <p className="text-xs text-stone-500 mt-0.5">{fmtWhen(item)}</p>
        {item.location && (
          <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {item.location}
          </p>
        )}
        {item.duplicate_count > 0 && (
          <p className="text-xs text-amber-600 mt-1">{item.duplicate_count + 1} similar items</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">{actions}</div>
    </div>
  );
}

export default function CalendarConnector() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [dupWarning, setDupWarning] = useState(null);
  const [editAppt, setEditAppt] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(Object.entries(GROUP_META).map(([k, v]) => [k, v.defaultOpen])),
  );

  const loadStatus = useCallback(() => {
    api.get("/calendar/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  const loadData = useCallback(() => {
    const q = showHidden ? "?include_hidden=true" : "";
    api.get(`/calendar/suggestions${q}`).then(({ data }) => setDashboard(data)).catch(() => setDashboard(null));
    api.get("/calendar/activity").then(({ data }) => setActivity(data || [])).catch(() => setActivity([]));
  }, [showHidden]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (status?.connected) loadData(); }, [status?.connected, loadData]);

  useEffect(() => {
    const r = params.get("calendar");
    if (!r) return;
    if (r === "connected") toast.success("Google Calendar connected");
    else if (r === "denied") toast.message("Calendar access was not granted");
    else if (r === "error") toast.error("Couldn't connect Google Calendar. Please try again.");
    params.delete("calendar");
    setParams(params, { replace: true });
    loadStatus();
  }, [params, setParams, loadStatus]);

  const connect = async () => {
    setBusy("connect");
    try {
      const { data } = await api.get("/calendar/connect");
      window.location.href = data.url;
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not start Google sign-in");
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await api.post("/calendar/disconnect");
      toast.success("Disconnected");
      setDashboard(null);
      loadStatus();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not disconnect");
    } finally { setBusy(""); }
  };

  const hideSuggestion = async (item, reason) => {
    const key = item.google_event_id || item.fingerprint;
    setBusy(key);
    try {
      await api.post("/calendar/suggestions/hide", {
        google_event_id: item.google_event_id || undefined,
        fingerprint: item.fingerprint,
        reason,
      });
      toast.success(reason === "already_handled" ? "Marked as handled" : reason === "not_duplicate" ? "Marked as not duplicate" : "Suggestion hidden");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update suggestion");
    } finally { setBusy(""); }
  };

  const importEvent = async (ev, alsoReminder) => {
    setBusy(ev.google_event_id);
    try {
      await api.post("/calendar/import", {
        google_event_id: ev.google_event_id,
        title: ev.title,
        date: ev.date,
        time: ev.time,
        location: ev.location,
        notes: ev.description || "",
        also_reminder: !!alsoReminder,
      });
      toast.success(`Imported "${ev.title}"`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not import");
    } finally { setBusy(""); }
  };

  const archiveAppt = async (appointmentId) => {
    setBusy(appointmentId);
    try {
      await api.post("/calendar/appointments/archive", { appointment_id: appointmentId, archive: true });
      toast.success("Removed from this list");
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not archive");
    } finally { setBusy(""); }
  };

  const saveEditAppt = async () => {
    if (!editAppt) return;
    setBusy(editAppt.id);
    try {
      await api.patch(`/appointments/${editAppt.id}`, {
        title: editAppt.title,
        date: editAppt.date,
        time: editAppt.time,
        location: editAppt.location,
      });
      toast.success("Appointment updated");
      setEditAppt(null);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save");
    } finally { setBusy(""); }
  };

  const requestAddToCalendar = async (appt) => {
    setBusy(appt.appointment_id || appt.id);
    try {
      const id = appt.appointment_id || appt.id;
      const { data } = await api.post("/calendar/check-duplicate", { appointment_id: id });
      if (data.duplicate_risk) {
        setDupWarning({ appt, matches: data.matches });
        setConfirm(null);
      } else {
        setConfirm({ id, title: appt.title, date: appt.date, time: appt.time, location: appt.location });
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not check duplicates");
    } finally { setBusy(""); }
  };

  const cleanupClutter = async () => {
    setBusy("cleanup");
    try {
      const { data } = await api.post("/calendar/cleanup-clutter");
      toast.success(data.message || "Clutter cleaned");
      setCleanupOpen(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not clean up");
    } finally {
      setBusy("");
    }
  };

  const addToCalendar = async (ignoreDuplicate = false) => {
    const appt = dupWarning?.appt || confirm;
    if (!appt) return;
    const id = appt.appointment_id || appt.id;
    setBusy(id);
    try {
      await api.post("/calendar/add-event", {
        appointment_id: id,
        ignore_duplicate_warning: ignoreDuplicate,
      });
      toast.success("Added to Google Calendar");
      setConfirm(null);
      setDupWarning(null);
      loadData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail?.duplicate_risk) {
        setDupWarning({ appt, matches: detail.matches || [] });
        setConfirm(null);
      } else {
        toast.error(formatApiError(detail) || "Could not add the event");
      }
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

  const filterItem = (item) => {
    if (!matchesSearch(item)) return false;
    if (filter === "all") return item.badge !== "hidden" && item.badge !== "handled";
    if (filter === "new") return item.badge === "new";
    if (filter === "duplicates") return item.badge === "possible_duplicate";
    if (filter === "imported") return item.badge === "imported";
    if (filter === "not_on_google") return item.badge === "not_on_google";
    if (filter === "hidden") return item.badge === "hidden" || item.badge === "handled";
    return true;
  };

  const groupedItems = useMemo(() => {
    if (!dashboard?.groups) return {};
    const out = {};
    for (const [key, items] of Object.entries(dashboard.groups)) {
      out[key] = (items || []).filter(filterItem);
    }
    return out;
  }, [dashboard, filter, search]);

  const notOnGoogle = useMemo(
    () => (dashboard?.not_on_google || []).filter(filterItem),
    [dashboard, filter, search],
  );

  const hiddenItems = useMemo(
    () => (dashboard?.hidden || []).filter(matchesSearch),
    [dashboard, search],
  );

  const activityVisible = showAllActivity ? activity : activity.slice(0, 5);
  const summary = dashboard?.summary;

  if (!status) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-calendar-page">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-sky-600 shrink-0" /> Google Calendar
          </h1>
          {status.connected && status.email && (
            <p className="text-sm text-emerald-700 mt-1 font-medium" data-testid="cal-connected-email">{status.email}</p>
          )}
          {!status.connected && (
            <p className="text-sm text-stone-500 mt-1">Connect to import and add events with your approval.</p>
          )}
        </div>
        {status.connected && summary && (
          <div className="rounded-xl border border-stone-200 bg-white p-3 shrink-0 min-w-[220px]" data-testid="cal-overview-compact">
            <p className="text-xs font-semibold text-stone-500 mb-2">Overview</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span>Today <strong>{summary.today_count ?? 0}</strong></span>
              <span>This week <strong>{summary.week_count ?? 0}</strong></span>
              <span>New <strong>{summary.new_suggestions ?? 0}</strong></span>
              <span>Duplicates <strong>{summary.possible_duplicates ?? 0}</strong></span>
              {(summary.hidden_count > 0) && (
                <span className="col-span-2 text-stone-500">Hidden/junk: {summary.hidden_count}</span>
              )}
            </div>
          </div>
        )}
        {status.connected && (
          <Button variant="outline" size="sm" className="rounded-xl shrink-0 self-start" onClick={loadData} data-testid="cal-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        )}
      </div>

      {!status.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5 flex items-start gap-3" data-testid="cal-not-configured">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Calendar connector isn&apos;t set up on this server yet</p>
            <p className="text-sm text-stone-600">Add Google OAuth credentials to enable connecting a calendar.</p>
          </div>
        </div>
      )}

      {status.configured && !status.connected && (
        <>
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center mb-5" data-testid="cal-connect-card">
            <span className="grid place-items-center w-14 h-14 rounded-full bg-sky-100 text-sky-700 mx-auto mb-3"><CalendarDays className="w-7 h-7" /></span>
            <h2 className="font-heading text-lg font-semibold">Connect Google Calendar</h2>
            <p className="text-stone-600 text-sm max-w-md mx-auto mt-1 mb-4">
              Connect Google Calendar to import events and add appointments.
            </p>
            {status.secure_storage === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 max-w-md mx-auto flex items-start gap-2" data-testid="cal-no-secure-storage">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Secure token storage isn&apos;t configured (<code>TOKEN_ENCRYPTION_KEY</code>).</span>
              </div>
            ) : (
              <Button onClick={connect} disabled={busy === "connect"} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="cal-connect-btn">
                {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4 mr-1" /> Connect Google Calendar</>}
              </Button>
            )}
          </div>
          <CreateEventWithAI connected={false} onSuccess={undefined} />
        </>
      )}

      {status.connected && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 mb-4 flex flex-wrap items-center justify-between gap-3" data-testid="cal-connected">
            <div className="flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Connected — nothing changes without your approval.</span>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={busy === "disconnect"} className="rounded-xl shrink-0">
              <Unlink className="w-4 h-4 mr-1" /> Disconnect
            </Button>
          </div>

          {dashboard === null ? (
            <div className="grid place-items-center py-6 mb-4"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
          ) : summary?.summary_text && (
            <p className="text-sm text-stone-600 mb-4">{summary.summary_text}</p>
          )}

          <div className="rounded-xl border border-stone-200 bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3" data-testid="cal-cleanup-card">
            <div>
              <p className="font-medium text-sm">Clean up clutter</p>
              <p className="text-xs text-stone-500">Hide repeated suggestions and archive duplicate MemoryMate rows.</p>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setCleanupOpen(true)} data-testid="cal-cleanup-btn">
              Clean up clutter
            </Button>
          </div>

          <CreateEventWithAI connected onSuccess={loadData} />

          {/* Search & filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4 mt-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                placeholder="Search calendar items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
                data-testid="cal-search"
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

          {showHidden && (
            <Button variant="ghost" size="sm" className="mb-3 text-stone-500" onClick={() => setShowHidden(false)}>
              <EyeOff className="w-4 h-4 mr-1" /> Hide hidden suggestions
            </Button>
          )}
          {!showHidden && (summary?.hidden_count > 0 || hiddenItems.length > 0) && (
            <Button variant="ghost" size="sm" className="mb-3 text-stone-500" onClick={() => setShowHidden(true)}>
              <Eye className="w-4 h-4 mr-1" /> Show hidden suggestions
            </Button>
          )}

          {/* Grouped suggestions */}
          <section className="mb-6">
            <h2 className="font-heading text-lg font-semibold mb-2 flex items-center gap-2">
              <Download className="w-5 h-5 text-sky-600" /> Suggestions
            </h2>
            {summary?.possible_duplicates > 3 && (
              <p className="text-sm text-amber-700 mb-3">We found several repeated events. Review duplicates before importing.</p>
            )}
            {dashboard && summary?.new_suggestions === 0 && summary?.possible_duplicates === 0 && (
              <EmptyState
                icon={CalendarDays}
                title="Your calendar is up to date"
                message="No new events need importing."
                testid="cal-no-suggestions"
              />
            )}
            {Object.entries(GROUP_META).map(([groupKey, meta]) => {
              const items = groupedItems[groupKey] || [];
              if (groupKey === "duplicates" && filter !== "all" && filter !== "duplicates") return null;
              if (groupKey !== "duplicates" && filter === "duplicates") return null;
              if (groupKey === "imported" && filter === "new") return null;
              if (items.length === 0 && groupKey !== "duplicates") return null;
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
                  </button>
                  {isOpen && items.length > 0 && (
                    <div className="px-3 pb-3 space-y-2" data-testid={`cal-group-${groupKey}`}>
                      {items.map((item) => {
                        const busyKey = item.google_event_id || item.fingerprint;
                        const isDup = groupKey === "duplicates";
                        return (
                          <CompactCard
                            key={item.google_event_id || item.fingerprint || item.appointment_id}
                            item={item}
                            testid="cal-suggestion"
                            actions={
                              isDup ? (
                                <>
                                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-8" onClick={() => importEvent(item, false)} disabled={busy === busyKey}>Import</Button>
                                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8" onClick={() => hideSuggestion(item, "not_duplicate")} disabled={busy === busyKey}>Not duplicate</Button>
                                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8" onClick={() => hideSuggestion(item, "already_handled")} disabled={busy === busyKey}>Handled</Button>
                                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8" onClick={() => hideSuggestion(item, "hidden")} disabled={busy === busyKey}>Hide</Button>
                                </>
                              ) : groupKey === "imported" ? (
                                <span className="text-xs text-stone-400">In MemoryMate</span>
                              ) : (
                                <>
                                  <Button size="sm" className="rounded-lg text-xs h-8 bg-sky-600 hover:bg-sky-700" onClick={() => importEvent(item, false)} disabled={busy === busyKey}>Import</Button>
                                  <Button size="sm" variant="outline" className="rounded-lg text-xs h-8" onClick={() => importEvent(item, true)} disabled={busy === busyKey}>+ reminder</Button>
                                  <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8" onClick={() => hideSuggestion(item, "hidden")} disabled={busy === busyKey}>Hide</Button>
                                </>
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                  {isOpen && items.length === 0 && groupKey === "duplicates" && (
                    <p className="px-4 pb-3 text-sm text-stone-400">No duplicates to review.</p>
                  )}
                </div>
              );
            })}
            {filter === "hidden" && hiddenItems.length > 0 && (
              <div className="space-y-2 mt-2">
                {hiddenItems.map((item) => (
                  <CompactCard
                    key={item.fingerprint || item.google_event_id}
                    item={item}
                    testid="cal-hidden-item"
                    actions={<span className="text-xs text-stone-400">Hidden</span>}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Not on Google */}
          {(filter === "all" || filter === "not_on_google") && (
            <section className="mb-6">
              <h2 className="font-heading text-lg font-semibold mb-2 flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-sky-600" /> Appointments not on Google
              </h2>
              {notOnGoogle.length === 0 ? (
                <EmptyState icon={CalendarPlus} title="All caught up" message="No MemoryMate appointments waiting to be added." testid="cal-no-appts" />
              ) : (
                <div className="space-y-2">
                  {notOnGoogle.map((a) => (
                    <CompactCard
                      key={a.appointment_id}
                      item={a}
                      testid="cal-appt"
                      actions={
                        <>
                          <Button size="sm" className="rounded-lg text-xs h-8 bg-sky-600 hover:bg-sky-700" onClick={() => requestAddToCalendar(a)} disabled={busy === a.appointment_id}>
                            Add to Google
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-lg text-xs h-8" onClick={() => setEditAppt({ ...a, id: a.appointment_id })}>Edit</Button>
                          <Button size="sm" variant="ghost" className="rounded-lg text-xs h-8" onClick={() => archiveAppt(a.appointment_id)}>Archive</Button>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Activity */}
          <section className="mt-6">
            <h2 className="font-heading text-lg font-semibold mb-2 flex items-center gap-2">
              <History className="w-5 h-5 text-sky-600" /> Recent Calendar Activity
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm text-stone-400" data-testid="cal-no-activity">No calendar activity yet.</p>
            ) : (
              <>
                <ul className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100" data-testid="cal-activity-list">
                  {activityVisible.map((a) => {
                    const meta = ACTIVITY_LABELS[a.kind] || { label: a.kind, icon: History, color: "text-stone-500" };
                    const Icon = meta.icon;
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
                        <span className="flex-1 min-w-0 text-stone-700">{meta.label}</span>
                        {a.detail && <span className="text-xs text-stone-400 truncate max-w-[40%]">{a.detail}</span>}
                        <span className="text-xs text-stone-400 shrink-0">{fmtActivityTime(a.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
                {activity.length > 5 && (
                  <Button variant="ghost" size="sm" className="mt-2 text-stone-500" onClick={() => setShowAllActivity((v) => !v)}>
                    {showAllActivity ? "Show less" : "View all activity"}
                  </Button>
                )}
              </>
            )}
          </section>
        </>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-sky-600" /> Add to Google Calendar?</DialogTitle>
            <DialogDescription>MemoryMate will create a new calendar event. It won&apos;t change existing events.</DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="font-medium">{confirm.title}</p>
              <p className="text-stone-500">{[confirm.date, confirm.time].filter(Boolean).join(" · ")}</p>
              {confirm.location && <p className="text-stone-500">{confirm.location}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={() => addToCalendar(false)} disabled={busy === confirm?.id}>
              {busy === confirm?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dupWarning} onOpenChange={(o) => !o && setDupWarning(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /> Similar event found</DialogTitle>
            <DialogDescription>This looks similar to an existing calendar event. Do you still want to add it?</DialogDescription>
          </DialogHeader>
          {dupWarning?.matches?.length > 0 && (
            <ul className="text-sm space-y-1 text-stone-600">
              {dupWarning.matches.map((m, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-2">{m.title} · {[m.date, m.time].filter(Boolean).join(" ")}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDupWarning(null)}>Cancel</Button>
            <Button className="rounded-xl bg-amber-600 hover:bg-amber-700" onClick={() => addToCalendar(true)} disabled={busy}>
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Clean up clutter?</DialogTitle>
            <DialogDescription>
              This will hide repeated suggestions and archive duplicate MemoryMate-only appointments. It will not delete Google Calendar events.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCleanupOpen(false)}>Cancel</Button>
            <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={cleanupClutter} disabled={busy === "cleanup"} data-testid="cal-cleanup-confirm">
              {busy === "cleanup" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Clean up clutter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editAppt} onOpenChange={(o) => !o && setEditAppt(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit appointment</DialogTitle>
          </DialogHeader>
          {editAppt && (
            <div className="space-y-3">
              <Input value={editAppt.title} onChange={(e) => setEditAppt({ ...editAppt, title: e.target.value })} placeholder="Title" />
              <Input type="date" value={editAppt.date} onChange={(e) => setEditAppt({ ...editAppt, date: e.target.value })} />
              <Input type="time" value={editAppt.time || ""} onChange={(e) => setEditAppt({ ...editAppt, time: e.target.value })} />
              <Input value={editAppt.location || ""} onChange={(e) => setEditAppt({ ...editAppt, location: e.target.value })} placeholder="Location" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAppt(null)}>Cancel</Button>
            <Button className="bg-sky-600 hover:bg-sky-700" onClick={saveEditAppt} disabled={busy === editAppt?.id}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
