import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import CaptureConsentModal from "./CaptureConsentModal";
import {
  Infinity as InfinityIcon, ShieldCheck, Mic, Pencil, Bell, ArrowLeft, ArrowRight,
  Check, Loader2, Pause, Square, Trash2, ClipboardList, Lock,
} from "lucide-react";
import { toast } from "sonner";

const DURATIONS = [
  { v: "1d", label: "For 1 day", hint: "Capture turns off automatically tomorrow." },
  { v: "1w", label: "For 1 week", hint: "A good choice to try it out." },
  { v: "1m", label: "For 1 month", hint: "Best for ongoing daily support." },
  { v: "until_off", label: "Until I turn it off", hint: "Stays on until you stop it yourself." },
  { v: "custom", label: "Choose an end date", hint: "Pick the exact day it should stop." },
];

const NOTE_STYLES = [
  { v: "short", label: "Very short and simple", ex: "Dentist tomorrow, 4 PM." },
  { v: "warm", label: "Warm and gentle", ex: "You have a dentist visit tomorrow at 4 PM. It's all arranged." },
  { v: "detailed", label: "Detailed summary", ex: "Dentist appointment tomorrow at 4 PM; someone will pick you up after lunch." },
  { v: "bullets", label: "Bullet points", ex: "- Dentist tomorrow 4 PM\n- Pickup after lunch" },
  { v: "family", label: "Family-friendly update", ex: "Just a note for the family: dentist tomorrow at 4 PM." },
  { v: "caregiver", label: "Caregiver-style report", ex: "Appointment logged: Dentist, tomorrow 16:00. Transport arranged." },
];

const REMINDER_TONES = [
  { v: "gentle", label: "Gentle", ex: "It may be time to take your medicine." },
  { v: "direct", label: "Direct", ex: "Take your medicine at 8 PM." },
  { v: "family", label: "Family tone", ex: "Your family wanted to remind you about your medicine." },
];

function ChoiceCard({ active, onClick, title, hint, testid }) {
  return (
    <button
      type="button" onClick={onClick} data-testid={testid}
      className={`w-full text-left rounded-2xl border-2 p-5 transition-all active:scale-[0.99] ${
        active ? "border-sky-500 bg-sky-50 shadow-sm" : "border-stone-200 bg-white hover:border-sky-300"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-semibold">{title}</p>
          {hint && <p className="text-sm text-stone-500 mt-0.5 whitespace-pre-line">{hint}</p>}
        </div>
        <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 ${active ? "bg-sky-600 text-white" : "bg-stone-100 text-stone-300"}`}>
          <Check className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}

export default function AlwaysOnSetup() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [duration, setDuration] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [micState, setMicState] = useState("idle"); // idle | granted | denied
  const [noteStyle, setNoteStyle] = useState("warm");
  const [reminderTone, setReminderTone] = useState("gentle");
  const [starting, setStarting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
    } catch {
      setMicState("denied");
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      setConsentOpen(false);
      await api.post("/capture/always-on/start", {
        duration,
        custom_until: duration === "custom" && customUntil ? new Date(customUntil).toISOString() : null,
        note_style: noteStyle,
        reminder_tone: reminderTone,
        consent_confirmed: true,
      });
      // Open a live capture session so dictation can begin right away.
      const { data } = await api.post("/capture/sessions", {
        mode: "capture", title: "Always-On capture", session_type: "routine",
        transcript_storage_mode: "summary_only", consent_confirmed: true,
      });
      toast.success("Memory Capture is ON");
      navigate(`${base}/capture/session/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not start Always-On capture");
      setStarting(false);
    }
  };

  const steps = ["Welcome", "How long", "Microphone", "Note style", "Reminder style", "Ready"];
  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => (step === 0 ? navigate(base) : setStep((s) => s - 1));

  const canNext =
    (step === 1 && duration && (duration !== "custom" || customUntil)) ||
    (step === 2 && micState !== "idle") ||
    step === 0 || step === 3 || step === 4;

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="always-on-setup-page">
      <button onClick={back} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1" data-testid="aon-back">
        <ArrowLeft className="w-4 h-4" /> {step === 0 ? "Back" : "Previous"}
      </button>

      {/* progress */}
      <div className="flex gap-1.5 mb-6" aria-hidden>
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-sky-500" : "bg-stone-200"}`} />
        ))}
      </div>

      {step === 0 && (
        <div data-testid="aon-step-welcome">
          <div className="flex items-center gap-3 mb-3">
            <span className="grid place-items-center w-14 h-14 rounded-2xl bg-sky-600 text-white"><InfinityIcon className="w-8 h-8" /></span>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold">Always-On Memory Capture</h1>
          </div>
          <p className="text-stone-700 text-lg leading-relaxed">
            MemoryMate can help remember important moments from your day by listening in the
            background and turning useful conversations into simple memory notes.
          </p>
          <p className="text-stone-700 text-lg leading-relaxed mt-3">
            You can <strong>pause</strong> or <strong>stop</strong> this anytime. Sensitive
            things are never saved automatically — they wait for your review.
          </p>
          <div className="mt-5 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-900">This is private and consent-based. A clear “Memory Capture is ON” status stays visible the whole time.</p>
          </div>
        </div>
      )}

      {step === 1 && (
        <div data-testid="aon-step-duration">
          <h1 className="font-heading text-2xl font-bold mb-1">How long should MemoryMate help capture memories?</h1>
          <p className="text-stone-600 mb-5">Choose one. You can change this later.</p>
          <div className="space-y-3">
            {DURATIONS.map((d) => (
              <ChoiceCard key={d.v} active={duration === d.v} onClick={() => setDuration(d.v)} title={d.label} hint={d.hint} testid={`aon-duration-${d.v}`} />
            ))}
            {duration === "custom" && (
              <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-4">
                <label className="text-sm font-medium text-stone-700">Stop capturing on this date</label>
                <Input type="date" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  className="mt-1 h-11 rounded-xl bg-white" data-testid="aon-custom-date" />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div data-testid="aon-step-mic">
          <h1 className="font-heading text-2xl font-bold mb-1">Allow the microphone</h1>
          <p className="text-stone-600 mb-4">So MemoryMate can listen for useful moments while capture is on.</p>
          <ul className="space-y-2 text-stone-700 mb-5">
            <li className="flex gap-2"><Mic className="w-5 h-5 text-sky-600 shrink-0" /> The app may listen in the background while it is ON.</li>
            <li className="flex gap-2"><Pencil className="w-5 h-5 text-sky-600 shrink-0" /> It only saves short, useful notes — not every word.</li>
            <li className="flex gap-2"><Lock className="w-5 h-5 text-sky-600 shrink-0" /> Sensitive or uncertain items go to Privacy Review first.</li>
            <li className="flex gap-2"><Pause className="w-5 h-5 text-sky-600 shrink-0" /> You can pause or stop anytime.</li>
          </ul>
          {micState === "granted" ? (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-2 text-emerald-800" data-testid="aon-mic-granted">
              <Check className="w-5 h-5" /> Microphone is allowed.
            </div>
          ) : (
            <Button onClick={requestMic} className="h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="aon-mic-allow">
              <Mic className="w-5 h-5 mr-2" /> Allow microphone
            </Button>
          )}
          {micState === "denied" && (
            <p className="mt-3 text-sm text-amber-700" data-testid="aon-mic-denied">
              Microphone was blocked. You can still continue and type notes, or enable it later in your browser settings.
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div data-testid="aon-step-note-style">
          <h1 className="font-heading text-2xl font-bold mb-1">How should MemoryMate write your memory notes?</h1>
          <p className="text-stone-600 mb-5">Pick the style that feels best.</p>
          <div className="space-y-3">
            {NOTE_STYLES.map((n) => (
              <ChoiceCard key={n.v} active={noteStyle === n.v} onClick={() => setNoteStyle(n.v)} title={n.label} hint={`e.g. ${n.ex}`} testid={`aon-note-${n.v}`} />
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div data-testid="aon-step-reminder-tone">
          <h1 className="font-heading text-2xl font-bold mb-1">How should reminders sound?</h1>
          <p className="text-stone-600 mb-5">This sets the tone of your reminders.</p>
          <div className="space-y-3">
            {REMINDER_TONES.map((r) => (
              <ChoiceCard key={r.v} active={reminderTone === r.v} onClick={() => setReminderTone(r.v)} title={r.label} hint={`“${r.ex}”`} testid={`aon-tone-${r.v}`} />
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div data-testid="aon-step-ready">
          <h1 className="font-heading text-2xl font-bold mb-1">You're all set</h1>
          <p className="text-stone-600 mb-5">Here's what you chose. You can change any of it later.</p>
          <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100">
            <Summary icon={InfinityIcon} label="Duration" value={DURATIONS.find((d) => d.v === duration)?.label || "—"} />
            <Summary icon={Mic} label="Microphone" value={micState === "granted" ? "Allowed" : "Not allowed (type notes)"} />
            <Summary icon={Pencil} label="Note style" value={NOTE_STYLES.find((n) => n.v === noteStyle)?.label} />
            <Summary icon={Bell} label="Reminder tone" value={REMINDER_TONES.find((r) => r.v === reminderTone)?.label} />
          </div>
          <div className="mt-4 rounded-2xl bg-stone-900 text-white p-4 text-sm flex gap-3" data-testid="aon-controls-note">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <p>While capture is on you can always <span className="inline-flex items-center gap-1"><Pause className="w-3.5 h-3.5" />Pause</span>,
              <span className="inline-flex items-center gap-1 ml-1"><Square className="w-3.5 h-3.5" />Stop</span>,
              <span className="inline-flex items-center gap-1 ml-1"><Trash2 className="w-3.5 h-3.5" />Delete recent</span>, or
              <span className="inline-flex items-center gap-1 ml-1"><ClipboardList className="w-3.5 h-3.5" />Review</span> notes from your home screen.</p>
          </div>
          <Button onClick={() => setConsentOpen(true)} disabled={starting} className="w-full h-13 mt-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base py-6" data-testid="aon-start-btn">
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><InfinityIcon className="w-5 h-5 mr-2" /> Turn on Memory Capture</>}
          </Button>
        </div>
      )}

      <CaptureConsentModal open={consentOpen} onOpenChange={setConsentOpen} onConfirm={start} loading={starting} />

      {step < 5 && (
        <div className="mt-7 flex justify-end">
          <Button onClick={next} disabled={!canNext} className="h-12 rounded-xl bg-sky-600 hover:bg-sky-700 px-6 text-base" data-testid="aon-next">
            Continue <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function Summary({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="flex items-center gap-2 text-stone-600"><Icon className="w-5 h-5 text-stone-400" /> {label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
