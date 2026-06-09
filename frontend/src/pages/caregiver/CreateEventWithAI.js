import { useState, useCallback, useMemo } from "react";
import api, { formatApiError } from "../../lib/api";
import { useSpeechToText } from "../capture/useSpeechToText";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  Sparkles, Mic, MicOff, Loader2, AlertTriangle, ShieldCheck, CalendarPlus, Save, Bell, Clock,
  MapPin, Navigation, X, Video, Users, Share2, Copy, Mail, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const EMPTY_DRAFT = {
  title: "", date: "", time: "", end_time: "", all_day: false,
  location: "", notes: "", reminder: "",
};

const CONF_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence — please review" };
const CONF_BADGE = {
  high: "bg-emerald-50 text-emerald-800 border-emerald-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-rose-50 text-rose-800 border-rose-200",
};

const DURATION_PRESETS = [
  { id: "30", label: "30 min", minutes: 30 },
  { id: "60", label: "1 hour", minutes: 60 },
  { id: "90", label: "1.5 hours", minutes: 90 },
  { id: "120", label: "2 hours", minutes: 120 },
  { id: "custom", label: "Custom", minutes: null },
];

const REMINDER_PRESETS = [
  { id: "none", label: "No reminder", value: "" },
  { id: "10min", label: "10 min before", value: "10 minutes before" },
  { id: "30min", label: "30 min before", value: "30 minutes before" },
  { id: "1hour", label: "1 hour before", value: "1 hour before" },
  { id: "1day", label: "1 day before", value: "1 day before" },
  { id: "custom", label: "Custom", value: null },
];

function addMinutesToTime(hhmm, minutes) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function durationMinutes(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

function formatDurationLabel(start, end) {
  const mins = durationMinutes(start, end);
  if (!mins) return "—";
  const preset = DURATION_PRESETS.find((p) => p.minutes === mins);
  if (preset) return preset.label;
  if (mins < 60) return `${mins} min`;
  const h = mins / 60;
  return Number.isInteger(h) ? (h === 1 ? "1 hour" : `${h} hours`) : `${h} hours`;
}

function detectReminderPreset(reminder) {
  if (!reminder?.trim()) return "none";
  const t = reminder.toLowerCase();
  if (/1\s*day|day before/.test(t)) return "1day";
  if (/1\s*hour|hour before|1hr/.test(t)) return "1hour";
  if (/30\s*min/.test(t)) return "30min";
  if (/10\s*min/.test(t)) return "10min";
  for (const p of REMINDER_PRESETS) {
    if (p.value && t === p.value.toLowerCase()) return p.id;
  }
  return "custom";
}

function detectDurationPreset(start, end) {
  if (!start || !end) return "60";
  const mins = durationMinutes(start, end);
  const match = DURATION_PRESETS.find((p) => p.minutes === mins);
  return match ? match.id : "custom";
}

function prepareDraftFields(draft) {
  const d = { ...EMPTY_DRAFT, ...draft };
  if (d.time && !d.end_time && !d.all_day) {
    d.end_time = addMinutesToTime(d.time, 60);
  }
  return d;
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimeDisplay(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function reminderDisplay(reminder, presetId) {
  if (!reminder?.trim()) return "No reminder";
  if (presetId !== "custom") {
    const p = REMINDER_PRESETS.find((x) => x.id === presetId);
    if (p && p.id !== "none") return p.label;
  }
  return reminder;
}

function googleMapsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

function wazeUrl(location) {
  return `https://waze.com/ul?q=${encodeURIComponent(location.trim())}&navigate=yes`;
}

function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildShareMessage(fields, result, reminderPreset) {
  const lines = [`MemoryMate calendar event: ${fields.title}`];
  lines.push(`Date: ${formatDateDisplay(fields.date)}`);
  if (fields.all_day) {
    lines.push("Time: All day");
  } else {
    lines.push(`Time: ${formatTimeDisplay(fields.time)}–${formatTimeDisplay(fields.end_time)}`);
  }
  if (fields.location?.trim()) lines.push(`Location: ${fields.location}`);
  if (result?.meeting_link) lines.push(`Meeting link: ${result.meeting_link}`);
  if (result?.html_link) lines.push(`Calendar link: ${result.html_link}`);
  const rem = reminderDisplay(fields.reminder, reminderPreset);
  if (rem !== "No reminder") lines.push(`Reminder: ${rem}`);
  return lines.join("\n");
}

function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function emailShareUrl(subject, body) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function LocationNavLinks({ location, className = "" }) {
  if (!location?.trim()) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button type="button" variant="outline" size="sm" className="rounded-full text-xs h-8"
        onClick={() => openExternal(googleMapsUrl(location))} data-testid="cal-ai-maps-link">
        <MapPin className="w-3.5 h-3.5 mr-1" /> Open in Google Maps
      </Button>
      <Button type="button" variant="outline" size="sm" className="rounded-full text-xs h-8"
        onClick={() => openExternal(wazeUrl(location))} data-testid="cal-ai-waze-link">
        <Navigation className="w-3.5 h-3.5 mr-1" /> Open in Waze
      </Button>
    </div>
  );
}

function PresetButton({ active, onClick, children, testId }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      data-testid={testId}
      className={`rounded-full text-xs h-8 px-3 ${active ? "bg-sky-600 text-white border-sky-600 hover:bg-sky-700 hover:text-white" : "border-stone-200"}`}
    >
      {children}
    </Button>
  );
}

export default function CreateEventWithAI({ connected, onSuccess }) {
  const [rawText, setRawText] = useState("");
  const [phase, setPhase] = useState("idle");
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState({ confidence: "", missing_fields: [], warnings: [], ai_used: true });
  const [fields, setFields] = useState(EMPTY_DRAFT);
  const [durationPreset, setDurationPreset] = useState("60");
  const [reminderPreset, setReminderPreset] = useState("none");
  const [busy, setBusy] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addError, setAddError] = useState("");
  const [onlineMeeting, setOnlineMeeting] = useState(false);
  const [attendees, setAttendees] = useState([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [successResult, setSuccessResult] = useState(null);

  const appendSpeech = useCallback((text) => {
    setRawText((t) => `${t}${text}`.trim());
  }, []);
  const { listening, interim, supported, toggle, stop } = useSpeechToText({ onResult: appendSpeech });

  const endTimeError = useMemo(() => {
    if (fields.all_day || !fields.time || !fields.end_time) return "";
    const mins = durationMinutes(fields.time, fields.end_time);
    if (mins === null) return "End time must be after the start time.";
    return "";
  }, [fields.time, fields.end_time, fields.all_day]);

  const canAddToGoogle = connected && fields.title && fields.date
    && (fields.all_day || fields.time) && !endTimeError;

  const applyDuration = (presetId) => {
    setDurationPreset(presetId);
    const preset = DURATION_PRESETS.find((p) => p.id === presetId);
    if (preset?.minutes && fields.time && !fields.all_day) {
      setFields((f) => ({ ...f, end_time: addMinutesToTime(f.time, preset.minutes) }));
    }
  };

  const applyReminder = (presetId) => {
    setReminderPreset(presetId);
    const preset = REMINDER_PRESETS.find((p) => p.id === presetId);
    if (presetId !== "custom") {
      setFields((f) => ({ ...f, reminder: preset.value }));
    }
  };

  const onStartTimeChange = (e) => {
    const newTime = e.target.value;
    setFields((f) => {
      const next = { ...f, time: newTime };
      if (!f.all_day && newTime && durationPreset !== "custom") {
        const mins = DURATION_PRESETS.find((p) => p.id === durationPreset)?.minutes;
        if (mins) next.end_time = addMinutesToTime(newTime, mins);
      }
      return next;
    });
  };

  const onEndTimeChange = (e) => {
    const newEnd = e.target.value;
    setFields((f) => ({ ...f, end_time: newEnd }));
    setDurationPreset(detectDurationPreset(fields.time, newEnd));
  };

  const setF = (k) => (e) => setFields((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const draftEvent = async () => {
    const text = rawText.trim();
    if (!text) { toast.error("Please describe the event first"); return; }
    setPhase("loading");
    setAddError("");
    try {
      const { data } = await api.post("/calendar/draft-event", { raw_text: text });
      const prepared = prepareDraftFields(data.draft || {});
      setDraft(data);
      setMeta({
        confidence: data.confidence || "medium",
        missing_fields: data.missing_fields || [],
        warnings: data.warnings || [],
        ai_used: data.ai_used !== false,
      });
      setFields(prepared);
      setDurationPreset(detectDurationPreset(prepared.time, prepared.end_time));
      setReminderPreset(detectReminderPreset(prepared.reminder));
      setPhase("draft");
    } catch (err) {
      setPhase("error");
      toast.error(formatApiError(err.response?.data?.detail) || "Could not create a draft");
    }
  };

  const reset = () => {
    setPhase("idle");
    setDraft(null);
    setFields(EMPTY_DRAFT);
    setDurationPreset("60");
    setReminderPreset("none");
    setMeta({ confidence: "", missing_fields: [], warnings: [], ai_used: true });
    setAddError("");
    setConfirmOpen(false);
    setOnlineMeeting(false);
    setAttendees([]);
    setAttendeeInput("");
    setSuccessResult(null);
    setRawText("");
    stop();
  };

  const addAttendee = () => {
    const email = attendeeInput.trim().toLowerCase();
    if (!email) {
      toast.error("Please enter an email address");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (attendees.includes(email)) {
      toast.error("This email is already on the invite list");
      return;
    }
    setAttendees((a) => [...a, email]);
    setAttendeeInput("");
  };

  const removeAttendee = (email) => setAttendees((a) => a.filter((x) => x !== email));

  const shareText = useMemo(
    () => buildShareMessage(fields, successResult, reminderPreset),
    [fields, successResult, reminderPreset],
  );

  const saveAppointmentOnly = async () => {
    if (!fields.title || !fields.date) {
      toast.error("Please add a title and date before saving");
      return;
    }
    if (!fields.all_day && !fields.time) {
      toast.error("Please add a start time or turn on all-day");
      return;
    }
    setBusy("save");
    try {
      await api.post("/appointments", {
        title: fields.title, date: fields.date, time: fields.all_day ? "" : fields.time,
        location: fields.location, notes: fields.notes || "Created from AI draft",
        reminder_time: fields.reminder,
      });
      if (fields.reminder) {
        await api.post("/reminders", {
          title: fields.title, description: fields.reminder,
          category: "appointment", due_date: fields.date, due_time: fields.all_day ? "" : fields.time,
        }).catch(() => {});
      }
      toast.success("Saved to MemoryMate");
      setSuccessResult({ memorymate_only: true });
      setPhase("success");
      onSuccess?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save appointment");
    } finally { setBusy(""); }
  };

  const addToGoogle = async () => {
    setBusy("google");
    setAddError("");
    try {
      const { data } = await api.post("/calendar/add-event", {
        title: fields.title, date: fields.date,
        time: fields.all_day ? "" : fields.time,
        end_time: fields.all_day ? "" : (fields.end_time || ""),
        all_day: fields.all_day,
        location: fields.location,
        notes: fields.notes,
        reminder: fields.reminder,
        source: "ai_draft",
        online_meeting: onlineMeeting && connected,
        meeting_provider: onlineMeeting && connected ? "google_meet" : null,
        attendees,
      });
      setConfirmOpen(false);
      setSuccessResult(data);
      setPhase("success");
      if (data.meet_warning) {
        toast.warning(data.meet_warning);
      } else {
        toast.success("Added to Google Calendar");
      }
      onSuccess?.();
    } catch (err) {
      const fallback = "Could not add this to Google Calendar. Please check the date/time or reconnect Google Calendar.";
      const msg = formatApiError(err.response?.data?.detail) || fallback;
      setAddError(msg);
      setConfirmOpen(false);
      toast.error(msg);
    } finally { setBusy(""); }
  };

  return (
    <section className="mb-8" data-testid="cal-create-ai">
      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-sky-600" /> Create event with AI
        </h2>
        <p className="text-sm text-stone-500 mb-4">
          Type or speak what should be added. MemoryMate will create a draft first, and nothing is added until you approve.
        </p>
        <Textarea
          value={rawText + (listening && interim ? ` ${interim}` : "")}
          onChange={(e) => setRawText(e.target.value)}
          placeholder='e.g. "Dentist appointment tomorrow at 4 PM, remind me 1 hour before."'
          className="rounded-xl min-h-[88px] mb-3"
          data-testid="cal-ai-input"
        />
        {!supported && (
          <p className="text-xs text-stone-500 mb-3 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Voice input is not supported in this browser. You can type instead.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={draftEvent} disabled={phase === "loading" || !rawText.trim()}
            className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="cal-ai-draft-btn">
            {phase === "loading" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Draft event
          </Button>
          {supported && (
            <Button variant="outline" onClick={toggle} className={`rounded-xl ${listening ? "border-red-300 text-red-700" : ""}`}
              data-testid="cal-ai-speak-btn">
              {listening ? <><MicOff className="w-4 h-4 mr-1" /> Stop listening</> : <><Mic className="w-4 h-4 mr-1" /> Speak</>}
            </Button>
          )}
          {phase === "draft" && (
            <Button variant="ghost" onClick={reset} className="rounded-xl">Clear</Button>
          )}
        </div>
      </div>

      {phase === "draft" && (
        <div className="bg-white border border-sky-200 rounded-2xl p-5 mb-4 space-y-6" data-testid="cal-ai-review">
          <div>
            <h3 className="font-heading font-semibold text-lg">Review event draft</h3>
            <p className="text-sm text-stone-500 mt-1">
              Check every detail before saving. Nothing is added to Google Calendar until you confirm.
            </p>
          </div>

          {/* A. Event details */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-4">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">Event details</h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input value={fields.title} onChange={setF("title")} className="mt-1 rounded-xl" data-testid="cal-ai-title" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={fields.date} onChange={setF("date")} className="mt-1 rounded-xl" data-testid="cal-ai-date" />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>Start time</Label>
                  <Input type="time" value={fields.time} onChange={onStartTimeChange} disabled={fields.all_day}
                    className="mt-1 rounded-xl" data-testid="cal-ai-time" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={fields.all_day} onCheckedChange={(v) => {
                    setFields((f) => ({ ...f, all_day: v }));
                    if (v) setOnlineMeeting(false);
                  }} data-testid="cal-ai-allday" />
                  <Label className="text-sm">All day</Label>
                </div>
              </div>
              {!fields.all_day && fields.time && (
                <div className="sm:col-span-2 space-y-2">
                  <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Duration</Label>
                  <div className="flex flex-wrap gap-2" data-testid="cal-ai-duration-btns">
                    {DURATION_PRESETS.map((p) => (
                      <PresetButton key={p.id} active={durationPreset === p.id} onClick={() => applyDuration(p.id)}
                        testId={`cal-ai-duration-${p.id}`}>
                        {p.label}
                      </PresetButton>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>End time</Label>
                <Input type="time" value={fields.end_time} onChange={onEndTimeChange}
                  disabled={fields.all_day || (durationPreset !== "custom" && !!fields.time)}
                  className="mt-1 rounded-xl" data-testid="cal-ai-end-time" />
                {endTimeError && (
                  <p className="text-xs text-rose-600 mt-1" data-testid="cal-ai-end-error">{endTimeError}</p>
                )}
                {!fields.all_day && fields.time && fields.end_time && !endTimeError && (
                  <p className="text-xs text-stone-500 mt-1">
                    Duration: {formatDurationLabel(fields.time, fields.end_time)}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Location</Label>
                <Input value={fields.location} onChange={setF("location")} className="rounded-xl"
                  placeholder="Add a place or address…" data-testid="cal-ai-location" />
                <div className="flex flex-wrap gap-2 items-center">
                  {fields.location?.trim() && (
                    <>
                      <LocationNavLinks location={fields.location} />
                      <Button type="button" variant="ghost" size="sm" className="rounded-full text-xs h-8 text-stone-600"
                        onClick={() => setFields((f) => ({ ...f, location: "" }))} data-testid="cal-ai-clear-location">
                        <X className="w-3.5 h-3.5 mr-1" /> Clear location
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-stone-400">
                  Place autocomplete and verified addresses can be added later with Google Maps/Places after cost approval.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Input value={fields.notes} onChange={setF("notes")} className="mt-1 rounded-xl" placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* B. Reminder */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide flex items-center gap-1">
              <Bell className="w-4 h-4" /> Reminder
            </h4>
            <div className="flex flex-wrap gap-2" data-testid="cal-ai-reminder-btns">
              {REMINDER_PRESETS.map((p) => (
                <PresetButton key={p.id} active={reminderPreset === p.id} onClick={() => applyReminder(p.id)}
                  testId={`cal-ai-reminder-${p.id}`}>
                  {p.label}
                </PresetButton>
              ))}
            </div>
            {reminderPreset === "custom" && (
              <Input value={fields.reminder} onChange={setF("reminder")} className="rounded-xl"
                placeholder='e.g. "45 minutes before"' data-testid="cal-ai-reminder-custom" />
            )}
            <p className="text-sm text-stone-600">
              Selected: <span className="font-medium">{reminderDisplay(fields.reminder, reminderPreset)}</span>
            </p>
          </div>

          {/* C. Meeting & sharing options */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-4" data-testid="cal-ai-meeting-section">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide flex items-center gap-1">
              <Video className="w-4 h-4" /> Meeting &amp; sharing options
            </h4>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 p-3">
              <div>
                <p className="text-sm font-medium">Add online meeting link</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  MemoryMate can request a Google Meet link when adding this event to Google Calendar.
                </p>
                {!connected && (
                  <p className="text-xs text-amber-700 mt-1">
                    Connect Google Calendar to create a Google event or Meet link.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-stone-500">Google Meet</span>
                <Switch
                  checked={onlineMeeting}
                  onCheckedChange={setOnlineMeeting}
                  disabled={!connected || fields.all_day}
                  data-testid="cal-ai-online-meeting"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Invite people</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={attendeeInput}
                  onChange={(e) => setAttendeeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAttendee())}
                  placeholder="name@example.com"
                  className="rounded-xl flex-1"
                  data-testid="cal-ai-attendee-input"
                />
                <Button type="button" variant="outline" onClick={addAttendee} className="rounded-xl shrink-0"
                  data-testid="cal-ai-add-attendee">
                  Add email
                </Button>
              </div>
              <p className="text-xs text-stone-500">Invites will only be sent after you confirm.</p>
              {attendees.length > 0 && (
                <ul className="space-y-1" data-testid="cal-ai-attendee-list">
                  {attendees.map((email) => (
                    <li key={email} className="flex items-center justify-between text-sm bg-stone-50 rounded-lg px-3 py-1.5">
                      <span>{email}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-stone-500"
                        onClick={() => removeAttendee(email)} data-testid={`cal-ai-remove-${email}`}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* D. Safety / review */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">Safety &amp; review</h4>
            <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${CONF_BADGE[meta.confidence] || CONF_BADGE.medium}`}
              data-testid="cal-ai-confidence">
              {CONF_LABEL[meta.confidence] || "Please review"}
              {meta.ai_used === false && " · Basic parser"}
            </span>
            {(meta.missing_fields?.length > 0 || meta.warnings?.length > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
                {meta.warnings?.map((w, i) => <p key={`w${i}`}>{w}</p>)}
                {meta.missing_fields?.length > 0 && (
                  <p>Missing: {meta.missing_fields.join(", ")} — please fill in before adding to Google Calendar.</p>
                )}
              </div>
            )}
          </div>

          {/* E. Final actions */}
          <div className="rounded-xl border border-stone-200 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide">Final actions</h4>
            {addError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 flex items-start gap-2"
                data-testid="cal-ai-add-error">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{addError}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset} className="rounded-xl">Cancel</Button>
              <Button variant="outline" onClick={saveAppointmentOnly} disabled={busy === "save"} className="rounded-xl"
                data-testid="cal-ai-save-appt">
                {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save to MemoryMate only
              </Button>
              {connected ? (
                <Button onClick={() => setConfirmOpen(true)} disabled={!canAddToGoogle || busy === "google"}
                  className={`rounded-xl ${canAddToGoogle ? "bg-sky-600 hover:bg-sky-700" : ""}`}
                  variant={canAddToGoogle ? "default" : "outline"}
                  data-testid="cal-ai-add-google">
                  <CalendarPlus className="w-4 h-4 mr-1" /> Add to Google Calendar
                </Button>
              ) : (
                <p className="text-sm text-stone-500 self-center">
                  Connect Google Calendar to create a Google event or Meet link.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-600" /> Add this event to Google Calendar?
            </DialogTitle>
            <DialogDescription>
              MemoryMate will create a new Google Calendar event. It will not edit or delete any existing events.
              Invites and meeting links are only created after you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm space-y-2" data-testid="cal-ai-confirm-summary">
            <p><span className="text-stone-500">Event title:</span> <span className="font-medium">{fields.title}</span></p>
            <p><span className="text-stone-500">Date:</span> {formatDateDisplay(fields.date)}</p>
            {fields.all_day ? (
              <p><span className="text-stone-500">Time:</span> All day</p>
            ) : (
              <>
                <p><span className="text-stone-500">Start time:</span> {formatTimeDisplay(fields.time)}</p>
                <p><span className="text-stone-500">End time:</span> {formatTimeDisplay(fields.end_time)}</p>
                <p><span className="text-stone-500">Duration:</span> {formatDurationLabel(fields.time, fields.end_time)}</p>
              </>
            )}
            <p><span className="text-stone-500">Reminder:</span> {reminderDisplay(fields.reminder, reminderPreset)}</p>
            <div>
              <p>
                <span className="text-stone-500">Location:</span>{" "}
                {fields.location?.trim() ? fields.location : "No location added."}
              </p>
              {fields.location?.trim() && <LocationNavLinks location={fields.location} className="mt-2" />}
            </div>
            <p><span className="text-stone-500">Online meeting:</span> {onlineMeeting && connected ? "Yes (Google Meet)" : "No"}</p>
            <p>
              <span className="text-stone-500">Attendees:</span>{" "}
              {attendees.length ? attendees.join(", ") : "None"}
            </p>
            {fields.notes && <p><span className="text-stone-500">Notes:</span> {fields.notes}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmOpen(false)} data-testid="cal-ai-confirm-back">
              Back to edit
            </Button>
            <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={addToGoogle} disabled={busy === "google"}
              data-testid="cal-ai-confirm-add">
              {busy === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm & add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {phase === "success" && successResult && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 mb-4 space-y-4" data-testid="cal-ai-success-share">
          <h3 className="font-heading font-semibold text-lg flex items-center gap-2 text-emerald-800">
            <ShieldCheck className="w-5 h-5" />
            {successResult.memorymate_only ? "Saved to MemoryMate" : "Event added to Google Calendar"}
          </h3>
          {successResult.meeting_link && (
            <p className="text-sm">
              <span className="text-stone-500">Meeting link:</span>{" "}
              <a href={successResult.meeting_link} target="_blank" rel="noopener noreferrer"
                className="text-sky-600 underline break-all">{successResult.meeting_link}</a>
            </p>
          )}
          {successResult.meet_warning && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {successResult.meet_warning}
            </p>
          )}
          <div className="rounded-xl border border-stone-200 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-stone-700 uppercase tracking-wide flex items-center gap-1">
              <Share2 className="w-4 h-4" /> Share event
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-xl"
                onClick={() => copyText(shareText).then(() => toast.success("Event details copied"))}
                data-testid="cal-ai-copy-details">
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy event details
              </Button>
              {successResult.html_link && (
                <>
                  <Button variant="outline" size="sm" className="rounded-xl"
                    onClick={() => copyText(successResult.html_link).then(() => toast.success("Calendar link copied"))}
                    data-testid="cal-ai-copy-event-link">
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy event link
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl"
                    onClick={() => openExternal(successResult.html_link)} data-testid="cal-ai-open-gcal">
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open Google Calendar event
                  </Button>
                </>
              )}
              {successResult.meeting_link && (
                <Button variant="outline" size="sm" className="rounded-xl"
                  onClick={() => copyText(successResult.meeting_link).then(() => toast.success("Meeting link copied"))}
                  data-testid="cal-ai-copy-meeting-link">
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy meeting link
                </Button>
              )}
              <Button variant="outline" size="sm" className="rounded-xl"
                onClick={() => openExternal(whatsappShareUrl(shareText))} data-testid="cal-ai-share-whatsapp">
                Share by WhatsApp
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl"
                onClick={() => openExternal(emailShareUrl(fields.title, shareText))} data-testid="cal-ai-share-email">
                <Mail className="w-3.5 h-3.5 mr-1" /> Share by email
              </Button>
            </div>
            {!successResult.html_link && !successResult.memorymate_only && (
              <p className="text-xs text-stone-500">Google event link was not returned by Google Calendar.</p>
            )}
            {successResult.memorymate_only && (
              <p className="text-xs text-stone-500">
                Connect Google Calendar to create a Google event or Meet link.
              </p>
            )}
          </div>
          <Button onClick={reset} className="rounded-xl" data-testid="cal-ai-done">Done</Button>
        </div>
      )}
    </section>
  );
}
