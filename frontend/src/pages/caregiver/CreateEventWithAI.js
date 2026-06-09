import { useState, useCallback } from "react";
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
  Sparkles, Mic, MicOff, Loader2, AlertTriangle, ShieldCheck, CalendarPlus, Save,
} from "lucide-react";
import { toast } from "sonner";

const EMPTY_DRAFT = {
  title: "", date: "", time: "", end_time: "", all_day: false,
  location: "", notes: "", reminder: "",
};

const CONF_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence — please review" };

export default function CreateEventWithAI({ connected, onSuccess }) {
  const [rawText, setRawText] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | loading | draft | error
  const [draft, setDraft] = useState(null);
  const [meta, setMeta] = useState({ confidence: "", missing_fields: [], warnings: [], ai_used: true });
  const [fields, setFields] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const appendSpeech = useCallback((text) => {
    setRawText((t) => `${t}${text}`.trim());
  }, []);
  const { listening, interim, supported, toggle, stop } = useSpeechToText({ onResult: appendSpeech });

  const setF = (k) => (e) => setFields((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const canAddToGoogle = connected && fields.title && fields.date && (fields.all_day || fields.time);

  const draftEvent = async () => {
    const text = rawText.trim();
    if (!text) { toast.error("Please describe the event first"); return; }
    setPhase("loading");
    try {
      const { data } = await api.post("/calendar/draft-event", { raw_text: text });
      setDraft(data);
      setMeta({
        confidence: data.confidence || "medium",
        missing_fields: data.missing_fields || [],
        warnings: data.warnings || [],
        ai_used: data.ai_used !== false,
      });
      setFields({ ...EMPTY_DRAFT, ...(data.draft || {}) });
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
    setMeta({ confidence: "", missing_fields: [], warnings: [], ai_used: true });
    setRawText("");
    stop();
  };

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
      toast.success("Saved as a MemoryMate appointment");
      reset();
      onSuccess?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save appointment");
    } finally { setBusy(""); }
  };

  const addToGoogle = async () => {
    setBusy("google");
    try {
      await api.post("/calendar/add-event", {
        title: fields.title, date: fields.date,
        time: fields.all_day ? "" : fields.time,
        end_time: fields.end_time || "",
        all_day: fields.all_day,
        location: fields.location,
        notes: fields.notes,
        reminder: fields.reminder,
        source: "ai_draft",
      });
      toast.success("Added to Google Calendar");
      setConfirmOpen(false);
      reset();
      onSuccess?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not add to Google Calendar");
    } finally { setBusy(""); }
  };

  return (
    <section className="mb-8" data-testid="cal-create-ai">
      {/* Card 1 — input */}
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

      {/* Card 2 — review draft */}
      {phase === "draft" && (
        <div className="bg-white border border-sky-200 rounded-2xl p-5 mb-4" data-testid="cal-ai-review">
          <h3 className="font-heading font-semibold mb-1">Review event draft</h3>
          <p className="text-xs text-stone-500 mb-3">
            {CONF_LABEL[meta.confidence] || "Please review"}
            {meta.ai_used === false && " · Basic parser (AI not configured)"}
          </p>
          {(meta.warnings?.length > 0 || meta.missing_fields?.length > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-900 space-y-1">
              {meta.warnings?.map((w, i) => <p key={`w${i}`}>{w}</p>)}
              {meta.missing_fields?.length > 0 && (
                <p>Missing: {meta.missing_fields.join(", ")} — please fill in before adding to Google Calendar.</p>
              )}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
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
                <Input type="time" value={fields.time} onChange={setF("time")} disabled={fields.all_day}
                  className="mt-1 rounded-xl" data-testid="cal-ai-time" />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={fields.all_day} onCheckedChange={(v) => setFields((f) => ({ ...f, all_day: v }))} data-testid="cal-ai-allday" />
                <Label className="text-sm">All day</Label>
              </div>
            </div>
            <div>
              <Label>End time</Label>
              <Input type="time" value={fields.end_time} onChange={setF("end_time")} disabled={fields.all_day}
                className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={fields.location} onChange={setF("location")} className="mt-1 rounded-xl" placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input value={fields.notes} onChange={setF("notes")} className="mt-1 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <Label>Reminder</Label>
              <Input value={fields.reminder} onChange={setF("reminder")} className="mt-1 rounded-xl"
                placeholder='e.g. "1 hour before"' />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset} className="rounded-xl">Cancel</Button>
            <Button variant="outline" onClick={saveAppointmentOnly} disabled={busy === "save"} className="rounded-xl"
              data-testid="cal-ai-save-appt">
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save as MemoryMate appointment only
            </Button>
            {connected ? (
              <Button onClick={() => setConfirmOpen(true)} disabled={!canAddToGoogle || busy === "google"}
                className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="cal-ai-add-google">
                <CalendarPlus className="w-4 h-4 mr-1" /> Add to Google Calendar
              </Button>
            ) : (
              <p className="text-sm text-stone-500 self-center">Connect Google Calendar first to add events there.</p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-600" /> Add this event to Google Calendar?
            </DialogTitle>
            <DialogDescription>
              MemoryMate will create a new calendar event. It won't change or remove any of your existing events.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
            <p className="font-medium">{fields.title}</p>
            <p className="text-stone-500">
              {fields.date}{fields.all_day ? " · All day" : fields.time ? ` · ${fields.time}` : ""}
              {fields.end_time && !fields.all_day ? ` – ${fields.end_time}` : ""}
            </p>
            {fields.location && <p className="text-stone-500">{fields.location}</p>}
            {fields.reminder && <p className="text-stone-500">Reminder: {fields.reminder}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={addToGoogle} disabled={busy === "google"}>
              {busy === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
