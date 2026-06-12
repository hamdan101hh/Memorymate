import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCaptureSession } from "./useCaptureSession";
import { useSpeechToText } from "./useSpeechToText";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import api, { formatApiError } from "../../lib/api";
import MemoryImageAttachments from "../../components/MemoryImageAttachments";
import {
  Pause, Play, Square, Plus, Loader2, Sparkles, Bell, Users, MapPin,
  Pill, CalendarClock, Lock, ShieldQuestion, CheckCircle2, ArrowLeft, ListChecks,
  Mic, MicOff, Infinity as InfinityIcon,
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
    if (!running) return undefined;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [start, running]);
  const mm = String(Math.floor(el / 60)).padStart(2, "0");
  const ss = String(el % 60).padStart(2, "0");
  return <span className="font-heading text-2xl font-bold tabular-nums" data-testid="capture-timer">{mm}:{ss}</span>;
}

function Chip({ icon: Icon, children, tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}>
      <Icon className="w-3 h-3" /> {children}
    </span>
  );
}

function ActiveCaptureBanner({ session, status, onStatus, onFocusNote }) {
  return (
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
          <Button size="sm" onClick={() => onStatus("paused")} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-pause-btn"><Pause className="w-4 h-4 mr-1" /> Pause</Button>
        ) : status === "paused" ? (
          <Button size="sm" onClick={() => onStatus("active")} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-resume-btn"><Play className="w-4 h-4 mr-1" /> Resume</Button>
        ) : null}
        <Button size="sm" onClick={() => onStatus("stopped")} className="rounded-xl bg-red-600 hover:bg-red-700" data-testid="capture-stop-btn"><Square className="w-4 h-4 mr-1" /> Stop</Button>
        <Button size="sm" onClick={onFocusNote} className="rounded-xl bg-white/10 hover:bg-white/20" data-testid="capture-addnote-btn"><Plus className="w-4 h-4 mr-1" /> Add note</Button>
      </div>
    </div>
  );
}

const CONTEXT_LABEL = {
  meeting: "Meeting", family_visit: "Family visit", doctor: "Doctor",
  phone_call: "Phone call", routine: "Routine", general: "General",
};

function CaptureInputs({ isMeeting, processing, onAddNote, onProcess, onAppend, noteRef }) {
  const [note, setNote] = useState("");
  const [transcript, setTranscript] = useState("");
  const [continuous, setContinuous] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [context, setContext] = useState(null);
  const [flushing, setFlushing] = useState(false);
  const bufferRef = useRef("");
  const submitNote = async () => { if (await onAddNote(note)) setNote(""); };

  // Free, on-device dictation — appends recognized speech to the transcript and,
  // in continuous mode, to the flush buffer that is auto-saved periodically.
  const appendSpeech = useCallback((text) => {
    setTranscript((prev) => (prev ? `${prev.trimEnd()} ${text}` : text).trimStart());
    bufferRef.current = `${bufferRef.current} ${text}`.trim();
  }, []);
  const { listening, interim, supported, toggle } = useSpeechToText({ onResult: appendSpeech });

  const flush = useCallback(async () => {
    const text = bufferRef.current.trim();
    if (!text || !onAppend) return;
    bufferRef.current = "";
    setFlushing(true);
    const data = await onAppend(text);
    setFlushing(false);
    if (data) {
      if (data.context) setContext(data.context);
      if (data.events?.length) setLiveEvents((prev) => [...data.events, ...prev]);
    }
  }, [onAppend]);

  // Auto-save buffered dictation every 20s while always-on capture is running.
  useEffect(() => {
    if (!continuous || !listening) return undefined;
    const t = setInterval(() => { flush(); }, 20000);
    return () => clearInterval(t);
  }, [continuous, listening, flush]);

  return (
    <div className="space-y-4 mb-6">
      <div className="flex gap-2">
        <Input ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a manual note during the session…" className="h-11 rounded-xl" data-testid="capture-note-input" />
        <Button onClick={submitNote} variant="outline" className="rounded-xl h-11">Add</Button>
      </div>

      {supported && (
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-stone-700 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5" data-testid="capture-continuous-toggle">
          <Checkbox checked={continuous} onCheckedChange={(v) => setContinuous(!!v)} />
          <InfinityIcon className="w-4 h-4 text-sky-600" /> Continuous (always-on) — auto-save events while I speak
        </label>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">What was said</label>
          {supported && (
            <Button
              type="button" size="sm" onClick={toggle}
              className={`rounded-xl ${listening ? "bg-red-600 hover:bg-red-700" : "bg-sky-600 hover:bg-sky-700"}`}
              data-testid="capture-dictate-btn"
            >
              {listening ? <><MicOff className="w-4 h-4 mr-1" /> Stop dictation</> : <><Mic className="w-4 h-4 mr-1" /> Speak (free)</>}
            </Button>
          )}
        </div>
        {listening && (
          <div className="mt-1 flex items-center gap-2 text-sm text-red-600" data-testid="capture-listening-indicator">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Listening on this device…
            {flushing && <span className="text-sky-600">saving…</span>}
            {interim && <span className="text-stone-400 italic truncate">{interim}</span>}
          </div>
        )}
        <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)}
          placeholder="Tap “Speak (free)” to dictate on this device, or type/paste what was said. The AI filters it and divides it into separate memory events."
          className="mt-1 min-h-[140px] rounded-xl" data-testid="capture-transcript-input" />
        {!supported && (
          <p className="mt-1 text-xs text-stone-400">On-device dictation isn’t supported in this browser — type or paste the transcript instead.</p>
        )}
      </div>

      {continuous ? (
        <div className="space-y-3" data-testid="continuous-panel">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-600">
              {context && <>Detected: <span className="font-semibold">{CONTEXT_LABEL[context] || context}</span> · </>}
              {liveEvents.length} event(s) saved so far.
            </p>
            <Button size="sm" variant="outline" onClick={flush} disabled={flushing} className="rounded-xl" data-testid="capture-flush-btn">
              {flushing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save now"}
            </Button>
          </div>
          {liveEvents.length > 0 && (
            <div className="space-y-2">{liveEvents.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
          )}
          <p className="text-xs text-stone-400">Press Stop in the banner above to end the session.</p>
        </div>
      ) : (
        <Button onClick={() => onProcess(transcript)} disabled={processing} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base" data-testid="capture-process-btn">
          {processing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Filtering & dividing…</> : <><Sparkles className="w-5 h-5 mr-2" /> {isMeeting ? "End meeting & summarize" : "Process & save"}</>}
        </Button>
      )}
    </div>
  );
}

function EventCard({ ev }) {
  const b = TYPE_BADGE[ev.event_type] || TYPE_BADGE.memory_event;
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4" data-testid="memory-event-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{ev.title}</h3>
        <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${b.c}`}><b.icon className="w-3.5 h-3.5" /> {ev.event_type.replace(/_/g, " ")}</span>
      </div>
      <p className="text-sm text-stone-700 mt-1">{ev.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {ev.people?.map((p, i) => <Chip key={`${ev.id}-person-${p}-${i}`} icon={Users}>{p}</Chip>)}
        {ev.places?.map((p, i) => <Chip key={`${ev.id}-place-${p}-${i}`} icon={MapPin}>{p}</Chip>)}
        {ev.reminders?.map((p, i) => <Chip key={`${ev.id}-rem-${p}-${i}`} icon={Bell}>{p}</Chip>)}
        {ev.privacy_level === "sensitive" && <Chip icon={Lock} tone="amber">sensitive</Chip>}
      </div>
      {ev.action_items?.length > 0 && (
        <div className="mt-2 text-xs text-stone-600">
          <span className="inline-flex items-center gap-1 font-medium"><ListChecks className="w-3.5 h-3.5" /> Action items</span>
          <ul className="list-disc pl-5 mt-1">{ev.action_items.map((a, i) => <li key={`${ev.id}-ai-${i}`}>{a}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function MeetingSummary({ s }) {
  const Block = ({ title, items }) => (!items || items.length === 0) ? null : (
    <div className="mt-3">
      <p className="text-sm font-semibold text-stone-700">{title}</p>
      <ul className="list-disc pl-5 text-sm text-stone-600 mt-1">{items.map((it, i) => <li key={`${title}-${i}`}>{it}</li>)}</ul>
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
      {s.disclaimer && (
        <p className="mt-3 text-xs text-amber-800 font-medium" data-testid="meeting-finance-disclaimer">{s.disclaimer}</p>
      )}
    </div>
  );
}

function SessionSummary({ result, isMeeting, base, navigate, session }) {
  const [attachedImages, setAttachedImages] = useState([]);
  const [savePermission, setSavePermission] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const saveMeetingNote = async () => {
    const imageIds = attachedImages.map((i) => i.id);
    if (imageIds.length && !savePermission) {
      toast.error("Please confirm before saving.");
      return;
    }
    setSavingNote(true);
    try {
      await api.post(`/capture/sessions/${session.id}/save-meeting-note`, {
        permission_confirmed: true,
        image_ids: imageIds,
      });
      toast.success("Meeting note saved to memories.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save meeting note.");
    } finally {
      setSavingNote(false);
    }
  };
  return (
    <div data-testid="session-summary">
      {isMeeting && result.meeting_summary && <MeetingSummary s={result.meeting_summary} />}

      {isMeeting && (
        <div className="mb-6">
          <MemoryImageAttachments
            captureSessionId={session.id}
            onImagesChange={setAttachedImages}
            sectionTitle="Meeting photos"
            sectionSubtitle="Add a photo of a board, notes, slide, place, or document to help MemoryMate create a better summary."
          />
          {attachedImages.length > 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
              <input type="checkbox" checked={savePermission} onChange={(e) => setSavePermission(e.target.checked)} data-testid="meeting-save-permission" />
              I have permission to save attached photos with this meeting note.
            </label>
          )}
          <Button
            onClick={saveMeetingNote}
            disabled={savingNote}
            className="mt-4 w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-700"
            data-testid="save-meeting-note-btn"
          >
            {savingNote ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save meeting note to memories"}
          </Button>
        </div>
      )}

      <h2 className="font-heading text-xl font-bold mb-1 mt-2">Memory events</h2>
      <p className="text-sm text-stone-500 mb-3">The AI filtered the conversation and saved only useful memory-support information.</p>
      {(!result.events || result.events.length === 0) ? (
        <p className="text-stone-400 mb-4">No events were saved from this session.</p>
      ) : (
        <div className="space-y-3">{result.events.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
      )}

      {result.review_items?.length > 0 && (
        <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4" data-testid="session-review-notice">
          <p className="text-sm text-amber-900 flex items-center gap-2"><ShieldQuestion className="w-5 h-5" /> {result.review_items.length} item(s) were sent to the Privacy Review queue for a decision.</p>
          <Button size="sm" onClick={() => navigate(`${base}/capture/review`)} className="mt-2 rounded-xl bg-amber-600 hover:bg-amber-700" data-testid="goto-review-btn">Open Privacy Review</Button>
        </div>
      )}

      {result.locked_count > 0 && (
        <div className="mt-5 rounded-xl bg-stone-900 text-white p-4" data-testid="session-vault-notice">
          <p className="text-sm flex items-center gap-2"><Lock className="w-5 h-5" /> {result.locked_count} sensitive item(s) were locked in your Private Vault.</p>
          <Button size="sm" onClick={() => navigate(`${base}/capture/vault`)} className="mt-2 rounded-xl bg-white/10 hover:bg-white/20" data-testid="goto-vault-btn">Open Private Vault</Button>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={() => navigate(`${base}/capture`)} className="rounded-xl h-11" data-testid="new-capture-btn">New capture</Button>
        <Button onClick={() => navigate(base)} className="rounded-xl h-11 bg-sky-600 hover:bg-sky-700" data-testid="capture-done-btn"><CheckCircle2 className="w-4 h-4 mr-1" /> Done</Button>
      </div>
    </div>
  );
}

export default function CaptureSession() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const noteRef = useRef(null);
  const { session, status, processing, result, changeStatus, addNote, process, append } = useCaptureSession();

  if (!session) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const isMeeting = session.mode === "meeting";

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="capture-session-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to dashboard</button>

      {status !== "completed" && (
        <>
          <ActiveCaptureBanner session={session} status={status} onStatus={changeStatus} onFocusNote={() => noteRef.current?.focus()} />
          <CaptureInputs isMeeting={isMeeting} processing={processing} onAddNote={addNote} onProcess={process} onAppend={append} noteRef={noteRef} />
          {isMeeting && (
            <MemoryImageAttachments
              captureSessionId={session.id}
              sectionTitle="Meeting photos"
              sectionSubtitle="Add a photo of a board, notes, slide, place, or document to help MemoryMate create a better summary."
            />
          )}
        </>
      )}

      {result && <SessionSummary result={result} isMeeting={isMeeting} base={base} navigate={navigate} session={session} />}
    </div>
  );
}
