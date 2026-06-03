import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Radio, Pause, Play, Square, Plus, Loader2, Sparkles, Bell, Users, MapPin,
  Pill, CalendarClock, Lock, ShieldQuestion, CheckCircle2, ArrowLeft, ListChecks,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_BADGE = {
  memory_event: { icon: Sparkles, c: "bg-sky-50 text-sky-700" },
  reminder: { icon: Bell, c: "bg-violet-50 text-violet-700" },
  appointment: { icon: CalendarClock, c: "bg-emerald-50 text-emerald-700" },
  medication: { icon: Pill, c: "bg-rose-50 text-rose-700" },
  person_place_update: { icon: Users, c: "bg-amber-50 text-amber-700" },
};

function Timer({ start, running }) {
  const [el, setEl] = useState(0);
  useEffect(() => {
    const base = new Date(start).getTime();
    const tick = () => setEl(Math.max(0, Math.floor((Date.now() - base) / 1000)));
    tick();
    if (!running) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [start, running]);
  const mm = String(Math.floor(el / 60)).padStart(2, "0");
  const ss = String(el % 60).padStart(2, "0");
  return <span className="font-heading text-2xl font-bold tabular-nums" data-testid="capture-timer">{mm}:{ss}</span>;
}

export default function CaptureSession() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("active");
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const noteRef = useRef(null);

  const load = () => api.get(`/capture/sessions/${id}`).then(({ data }) => {
    setSession(data); setStatus(data.status);
    if (data.status === "completed") setResult({ events: data.events, meeting_summary: data.meeting_summary, review_items: null });
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const setSessionStatus = async (s) => {
    setStatus(s);
    try { await api.patch(`/capture/sessions/${id}`, { status: s }); }
    catch (e) { console.error("Failed to update session status", e); toast.error("Couldn't update the session. Please try again."); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try { await api.post(`/capture/sessions/${id}/note`, { note }); setNote(""); toast.success("Note added"); }
    catch { toast.error("Could not add note"); }
  };
  const process = async () => {
    if (!transcript.trim()) { toast.error("Paste a transcript to process."); return; }
    setProcessing(true);
    try {
      const { data } = await api.post(`/capture/sessions/${id}/process`, { transcript });
      setResult(data); setStatus("completed");
      toast.success(`Saved ${data.events.length} memory event(s)`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not process");
    } finally { setProcessing(false); }
  };

  if (!session) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const isMeeting = session.mode === "meeting";

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="capture-session-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to dashboard</button>

      {/* Active capture banner */}
      {status !== "completed" && (
        <div className="rounded-2xl bg-stone-900 text-white p-6 mb-6" data-testid="active-capture-banner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`grid place-items-center w-3 h-3 rounded-full ${status === "active" ? "bg-red-500 animate-pulse" : "bg-amber-400"}`} />
              <span className="font-semibold">{status === "active" ? "Capture is ON" : status === "paused" ? "Capture paused" : "Capture stopped"}</span>
            </div>
            <Timer start={session.start_time} running={status === "active"} />
          </div>
          <p className="text-stone-300 mt-1 text-sm">{session.title}{session.people_involved ? ` · ${session.people_involved}` : ""}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "active" ? (
              <Button size="sm" onClick={() => setSessionStatus("paused")} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-pause-btn"><Pause className="w-4 h-4 mr-1" /> Pause</Button>
            ) : status === "paused" ? (
              <Button size="sm" onClick={() => setSessionStatus("active")} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-resume-btn"><Play className="w-4 h-4 mr-1" /> Resume</Button>
            ) : null}
            <Button size="sm" onClick={() => setSessionStatus("stopped")} className="rounded-xl bg-red-600 hover:bg-red-700" data-testid="capture-stop-btn"><Square className="w-4 h-4 mr-1" /> Stop</Button>
            <Button size="sm" onClick={() => noteRef.current?.focus()} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-addnote-btn"><Plus className="w-4 h-4 mr-1" /> Add note</Button>
          </div>
        </div>
      )}

      {/* Manual notes + transcript-for-testing */}
      {status !== "completed" && (
        <div className="space-y-4 mb-6">
          <div className="flex gap-2">
            <Input ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a manual note during the session…" className="h-11 rounded-xl" data-testid="capture-note-input" />
            <Button onClick={addNote} variant="outline" className="rounded-xl h-11">Add</Button>
          </div>
          <div>
            <label className="text-sm font-semibold">Transcript (paste for testing)</label>
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste or type what was said. The AI will filter it and divide it into separate memory events."
              className="mt-1 min-h-[140px] rounded-xl" data-testid="capture-transcript-input" />
          </div>
          <Button onClick={process} disabled={processing} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base" data-testid="capture-process-btn">
            {processing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Filtering & dividing…</> : <><Sparkles className="w-5 h-5 mr-2" /> {isMeeting ? "End meeting & summarize" : "Process & save"}</>}
          </Button>
        </div>
      )}

      {/* Session summary */}
      {result && (
        <div data-testid="session-summary">
          {isMeeting && result.meeting_summary && <MeetingSummary s={result.meeting_summary} />}

          <h2 className="font-heading text-xl font-bold mb-1 mt-2">Memory events</h2>
          <p className="text-sm text-stone-500 mb-3">The AI filtered the conversation and saved only useful memory-support information.</p>
          {(!result.events || result.events.length === 0) ? (
            <p className="text-stone-400 mb-4">No events were saved from this session.</p>
          ) : (
            <div className="space-y-3">
              {result.events.map((ev) => {
                const b = TYPE_BADGE[ev.event_type] || TYPE_BADGE.memory_event;
                return (
                  <div key={ev.id} className="bg-white border border-stone-200 rounded-xl p-4" data-testid="memory-event-card">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{ev.title}</h3>
                      <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${b.c}`}><b.icon className="w-3.5 h-3.5" /> {ev.event_type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-sm text-stone-700 mt-1">{ev.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {ev.people?.map((p, i) => <Chip key={`p${i}`} icon={Users}>{p}</Chip>)}
                      {ev.places?.map((p, i) => <Chip key={`pl${i}`} icon={MapPin}>{p}</Chip>)}
                      {ev.reminders?.map((p, i) => <Chip key={`r${i}`} icon={Bell}>{p}</Chip>)}
                      {ev.privacy_level === "sensitive" && <Chip icon={Lock} tone="amber">sensitive</Chip>}
                    </div>
                    {ev.action_items?.length > 0 && (
                      <div className="mt-2 text-xs text-stone-600">
                        <span className="inline-flex items-center gap-1 font-medium"><ListChecks className="w-3.5 h-3.5" /> Action items</span>
                        <ul className="list-disc pl-5 mt-1">{ev.action_items.map((a, i) => <li key={i}>{a}</li>)}</ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result.review_items?.length > 0 && (
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4" data-testid="session-review-notice">
              <p className="text-sm text-amber-900 flex items-center gap-2"><ShieldQuestion className="w-5 h-5" /> {result.review_items.length} item(s) were sent to the Privacy Review queue for a decision.</p>
              <Button size="sm" onClick={() => navigate(`${base}/capture/review`)} className="mt-2 rounded-xl bg-amber-600 hover:bg-amber-700" data-testid="goto-review-btn">Open Privacy Review</Button>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => navigate(`${base}/capture`)} className="rounded-xl h-11" data-testid="new-capture-btn">New capture</Button>
            <Button onClick={() => navigate(base)} className="rounded-xl h-11 bg-sky-600 hover:bg-sky-700" data-testid="capture-done-btn"><CheckCircle2 className="w-4 h-4 mr-1" /> Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ icon: Icon, children, tone }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}><Icon className="w-3 h-3" /> {children}</span>;
}

function MeetingSummary({ s }) {
  const Block = ({ title, items }) => (!items || items.length === 0) ? null : (
    <div className="mt-3">
      <p className="text-sm font-semibold text-stone-700">{title}</p>
      <ul className="list-disc pl-5 text-sm text-stone-600 mt-1">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-5 mb-6" data-testid="meeting-summary">
      <div className="flex items-center gap-2 font-semibold text-violet-800"><Sparkles className="w-5 h-5" /> Meeting summary</div>
      <p className="mt-2 text-stone-700 text-sm leading-relaxed">{s.summary}</p>
      <Block title="Key points" items={s.key_points} />
      <Block title="Decisions made" items={s.decisions} />
      <Block title="Action items" items={s.action_items} />
      <Block title="Follow-up tasks" items={s.follow_ups} />
      <Block title="People mentioned" items={s.people} />
      <Block title="Dates mentioned" items={s.dates} />
      <Block title="Next steps" items={s.next_steps} />
    </div>
  );
}
