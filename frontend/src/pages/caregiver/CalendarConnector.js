import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  CalendarDays, CheckCircle2, AlertTriangle, Loader2, Link2, Unlink,
  CalendarPlus, Download, MapPin, RefreshCw, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

function fmtWhen(s, allDay) {
  if (!s) return "";
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return allDay
      ? d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
      : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return s; }
}
function splitWhen(s) {
  if (!s) return { date: "", time: "" };
  if (s.includes("T")) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return { date: s.slice(0, 10), time: "" };
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date, time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
  }
  return { date: s.slice(0, 10), time: "" };
}

export default function CalendarConnector() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null); // appointment pending "add to calendar" approval

  const loadStatus = useCallback(() => {
    api.get("/calendar/status").then(({ data }) => setStatus(data)).catch(() => setStatus({ configured: false, connected: false }));
  }, []);
  const loadData = useCallback(() => {
    api.get("/calendar/suggestions").then(({ data }) => setSuggestions(data)).catch(() => setSuggestions([]));
    api.get("/appointments").then(({ data }) => setAppointments(data || [])).catch(() => setAppointments([]));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (status?.connected) loadData(); }, [status?.connected, loadData]);

  // handle OAuth redirect result
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
    try { await api.post("/calendar/disconnect"); toast.success("Disconnected"); setSuggestions(null); loadStatus(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Could not disconnect"); }
    finally { setBusy(""); }
  };

  const importEvent = async (ev, alsoReminder) => {
    setBusy(ev.google_event_id);
    const { date, time } = splitWhen(ev.start);
    try {
      await api.post("/calendar/import", {
        google_event_id: ev.google_event_id, title: ev.title, date, time,
        location: ev.location, notes: ev.description, also_reminder: !!alsoReminder,
      });
      toast.success(`Imported "${ev.title}"`);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not import");
    } finally { setBusy(""); }
  };

  const addToCalendar = async () => {
    if (!confirm) return;
    setBusy(confirm.id);
    try {
      await api.post("/calendar/add-event", { appointment_id: confirm.id });
      toast.success("Added to Google Calendar");
      setConfirm(null); loadData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not add the event");
    } finally { setBusy(""); }
  };

  if (!status) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  const notOnCalendar = appointments.filter((a) => !a.google_event_id && a.title && a.date);

  return (
    <div data-testid="cg-calendar-page">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <CalendarDays className="w-7 h-7 text-sky-600" /> Google Calendar
        </h1>
        {status.connected && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={loadData} data-testid="cal-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        )}
      </div>
      <p className="text-stone-600 mb-5">
        Connect a Google Calendar to bring appointments into MemoryMate and keep them in sync.
        MemoryMate only reads with permission, imports or adds events after you approve them, and
        never edits or deletes anything on your calendar.
      </p>

      {/* Not configured on server */}
      {!status.configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5 flex items-start gap-3" data-testid="cal-not-configured">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Calendar connector isn't set up on this server yet</p>
            <p className="text-sm text-stone-600">Add Google OAuth credentials (see <code>backend/.env.example</code> and DEPLOY.md) to enable connecting a calendar.</p>
          </div>
        </div>
      )}

      {/* Configured but not connected */}
      {status.configured && !status.connected && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center" data-testid="cal-connect-card">
          <span className="grid place-items-center w-14 h-14 rounded-full bg-sky-100 text-sky-700 mx-auto mb-3"><CalendarDays className="w-7 h-7" /></span>
          <h2 className="font-heading text-lg font-semibold">Connect your Google Calendar</h2>
          <p className="text-stone-600 text-sm max-w-md mx-auto mt-1 mb-4">
            You'll be asked to sign in with Google and grant calendar access. You can disconnect anytime.
          </p>
          <Button onClick={connect} disabled={busy === "connect"} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="cal-connect-btn">
            {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Link2 className="w-4 h-4 mr-1" /> Connect Google Calendar</>}
          </Button>
        </div>
      )}

      {/* Connected */}
      {status.connected && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-5 flex items-center gap-3" data-testid="cal-connected">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-emerald-800">Connected{status.email ? ` · ${status.email}` : ""}</p>
              <p className="text-sm text-stone-600">Reading is permission-based. Nothing imports or syncs without your approval.</p>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={busy === "disconnect"} className="rounded-xl shrink-0">
              <Unlink className="w-4 h-4 mr-1" /> Disconnect
            </Button>
          </div>

          {/* Suggestions to import (calendar -> MemoryMate) */}
          <section className="mb-8">
            <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2"><Download className="w-5 h-5 text-sky-600" /> Suggestions to import</h2>
            <p className="text-sm text-stone-500 mb-3">Upcoming calendar events you haven't imported yet. Import the ones you want as MemoryMate appointments.</p>
            {suggestions === null ? (
              <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
            ) : suggestions.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nothing new to import" message="New calendar events will appear here as suggestions." testid="cal-no-suggestions" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {suggestions.map((ev) => (
                  <div key={ev.google_event_id} className="bg-white border border-stone-200 rounded-xl p-4" data-testid="cal-suggestion">
                    <p className="font-semibold truncate">{ev.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{fmtWhen(ev.start, ev.all_day)}</p>
                    {ev.location && <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</p>}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => importEvent(ev, false)} disabled={busy === ev.google_event_id} className="rounded-lg bg-sky-600 hover:bg-sky-700">
                        {busy === ev.google_event_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Import"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => importEvent(ev, true)} disabled={busy === ev.google_event_id} className="rounded-lg">
                        Import + reminder
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add MemoryMate appointments to calendar (MemoryMate -> calendar) */}
          <section>
            <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2"><CalendarPlus className="w-5 h-5 text-sky-600" /> Add appointments to Google Calendar</h2>
            <p className="text-sm text-stone-500 mb-3">MemoryMate appointments not yet on your calendar. Each one is added only after you confirm.</p>
            {notOnCalendar.length === 0 ? (
              <EmptyState icon={CalendarPlus} title="All caught up" message="MemoryMate appointments will appear here when they can be added to your calendar." testid="cal-no-appts" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {notOnCalendar.map((a) => (
                  <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-4" data-testid="cal-appt">
                    <p className="font-semibold truncate">{a.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{[a.date, a.time].filter(Boolean).join(" · ")}</p>
                    {a.location && <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {a.location}</p>}
                    <Button size="sm" variant="outline" onClick={() => setConfirm(a)} className="rounded-lg mt-3">
                      <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Add to Google Calendar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Approval confirmation for adding to calendar */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-sky-600" /> Add this event to Google Calendar?</DialogTitle>
            <DialogDescription>
              MemoryMate will create a new calendar event. It won't change or remove any of your existing events.
            </DialogDescription>
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
            <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={addToCalendar} disabled={busy === confirm?.id}>
              {busy === confirm?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
