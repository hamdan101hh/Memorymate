import { useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import MvpDisclaimer from "../../components/caregiver/MvpDisclaimer";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../../components/ui/dialog";
import {
  Sparkles, Loader2, AlertTriangle, ShieldCheck, CalendarPlus, Save, X,
} from "lucide-react";
import { toast } from "sonner";

const EMPTY = {
  title: "", date: "", time: "", end_time: "", all_day: false,
  location: "", notes: "", reminder: "", doctor_or_clinic: "",
};

function addMinutes(hm, mins) {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  const t = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default function CreateAppointmentWithAI({ onSuccess }) {
  const [prompt, setPrompt] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [conversation, setConversation] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [fields, setFields] = useState(EMPTY);
  const [options, setOptions] = useState({ urgent: false, add_to_google: false, online_meeting: false, attendees: [] });
  const [warnings, setWarnings] = useState([]);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [busy, setBusy] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [addToGoogle, setAddToGoogle] = useState(false);
  const [onlineMeeting, setOnlineMeeting] = useState(false);
  const [dupModal, setDupModal] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    api.get("/calendar/status").then(({ data }) => setCalendarConnected(data?.connected)).catch(() => setCalendarConnected(false));
  }, []);

  const reset = () => {
    setPrompt("");
    setFollowUp("");
    setConversation([]);
    setPhase("idle");
    setFields(EMPTY);
    setOptions({ urgent: false, add_to_google: false, online_meeting: false, attendees: [] });
    setWarnings([]);
    setFollowUpQuestion("");
    setAddToGoogle(false);
    setOnlineMeeting(false);
    setDupModal(null);
    setConfirmOpen(false);
    setPendingAction(null);
  };

  const draftAppointment = async (text, conv) => {
    setBusy("draft");
    try {
      const { data } = await api.post("/appointments/draft-ai", {
        raw_text: text,
        conversation: conv.length ? conv : undefined,
      });
      const d = data.draft || {};
      const prepared = {
        ...EMPTY,
        title: d.title || "",
        date: d.date || "",
        time: d.time || "",
        end_time: d.end_time || (d.time ? addMinutes(d.time, 60) : ""),
        all_day: d.all_day || false,
        location: d.location || "",
        notes: d.notes || "",
        reminder: d.reminder || "",
        doctor_or_clinic: d.doctor_or_clinic || "",
      };
      setFields(prepared);
      setOptions(data.options || {});
      setWarnings(data.warnings || []);
      setAddToGoogle(Boolean(data.options?.add_to_google));
      setOnlineMeeting(Boolean(data.options?.online_meeting));
      if (data.status === "needs_info" && data.follow_up_question) {
        setFollowUpQuestion(data.follow_up_question);
        setPhase("clarify");
      } else {
        setPhase("draft");
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not draft appointment");
      setPhase("idle");
    } finally {
      setBusy("");
    }
  };

  const onDraft = () => {
    const text = prompt.trim();
    if (!text) {
      toast.error("Please describe the appointment");
      return;
    }
    setConversation([{ role: "user", text }]);
    draftAppointment(text, [{ role: "user", text }]);
  };

  const onClarify = () => {
    const answer = followUp.trim();
    if (!answer) {
      toast.error("Please answer the question");
      return;
    }
    const conv = [...conversation, { role: "user", text: answer }];
    setConversation(conv);
    draftAppointment(answer, conv);
    setFollowUp("");
  };

  const buildPayload = (withGoogle) => ({
    title: fields.title,
    date: fields.date,
    time: fields.all_day ? "" : fields.time,
    end_time: fields.all_day ? "" : fields.end_time,
    all_day: fields.all_day,
    location: fields.location,
    notes: fields.notes,
    reminder_time: fields.reminder,
    doctor_or_clinic: fields.doctor_or_clinic,
    add_to_google: withGoogle,
    online_meeting: withGoogle && onlineMeeting,
    attendees: options.attendees || [],
    ignore_duplicate_warning: false,
  });

  const save = async (withGoogle, ignoreDup = false, updateId = null) => {
    if (!fields.title || !fields.date) {
      toast.error("Title and date are required");
      return;
    }
    if (!fields.all_day && !fields.time) {
      toast.error("Please set a time or mark all-day");
      return;
    }
    setBusy(withGoogle ? "google" : "save");
    try {
      const payload = {
        ...buildPayload(withGoogle),
        ignore_duplicate_warning: ignoreDup,
        update_existing_id: updateId || undefined,
      };
      const { data } = await api.post("/appointments/create-from-draft", payload);
      toast.success(withGoogle ? "Saved and added to Google Calendar" : "Appointment saved");
      setPhase("success");
      setDupModal(null);
      setConfirmOpen(false);
      onSuccess?.(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail?.duplicate_risk) {
        setDupModal({
          matches: detail.matches || [],
          withGoogle,
        });
      } else {
        toast.error(formatApiError(detail) || "Could not save appointment");
      }
    } finally {
      setBusy("");
    }
  };

  const requestSave = (withGoogle) => {
    setPendingAction({ withGoogle });
    setConfirmOpen(true);
  };

  const onConfirmSave = () => {
    if (pendingAction) save(pendingAction.withGoogle);
  };

  const setF = (k) => (e) => setFields((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  return (
    <section className="mb-6" data-testid="appt-create-ai">
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-sky-600" /> Create appointment with AI
        </h2>
        <p className="text-sm text-stone-500 mb-3">
          Type an appointment in normal words. MemoryMate will turn it into a clean appointment for review.
        </p>
        <MvpDisclaimer className="mb-3" />

        {phase === "idle" && (
          <>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Dentist at Dubai Mall tomorrow at 4 PM, remind me 1 hour before"
              className="rounded-xl min-h-[80px] mb-3"
              data-testid="appt-ai-input"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={onDraft} disabled={busy === "draft" || !prompt.trim()}
                className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="appt-ai-draft-btn">
                {busy === "draft" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Draft appointment
              </Button>
            </div>
          </>
        )}

        {phase === "clarify" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-900">{followUpQuestion}</p>
            <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="rounded-xl" data-testid="appt-ai-clarify" />
            <div className="flex gap-2">
              <Button onClick={onClarify} disabled={busy === "draft"} className="rounded-xl bg-sky-600 hover:bg-sky-700">
                {busy === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
              </Button>
              <Button variant="ghost" onClick={reset} className="rounded-xl"><X className="w-4 h-4 mr-1" /> Clear</Button>
            </div>
          </div>
        )}

        {phase === "draft" && (
          <div className="space-y-4" data-testid="appt-ai-review">
            {warnings.length > 0 && (
              <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {options.urgent && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">Marked urgent</span>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input value={fields.title} onChange={setF("title")} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={fields.date} onChange={setF("date")} className="mt-1 rounded-xl" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Time</Label>
                  <Input type="time" value={fields.time} onChange={setF("time")} disabled={fields.all_day} className="mt-1 rounded-xl" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={fields.all_day} onCheckedChange={(v) => setFields((f) => ({ ...f, all_day: v }))} />
                  <Label className="text-sm">All day</Label>
                </div>
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" value={fields.end_time} onChange={setF("end_time")} disabled={fields.all_day} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={fields.location} onChange={setF("location")} className="mt-1 rounded-xl" />
              </div>
              <div className="sm:col-span-2">
                <Label>Reminder</Label>
                <Input value={fields.reminder} onChange={setF("reminder")} className="mt-1 rounded-xl" placeholder="e.g. 1 hour before" />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={fields.notes} onChange={setF("notes")} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Switch checked={addToGoogle} onCheckedChange={setAddToGoogle} disabled={!calendarConnected} />
                <Label>Add to Google Calendar after save</Label>
              </div>
              {addToGoogle && calendarConnected && (
                <div className="flex items-center gap-2">
                  <Switch checked={onlineMeeting} onCheckedChange={setOnlineMeeting} />
                  <Label>Google Meet link</Label>
                </div>
              )}
            </div>
            {!calendarConnected && (
              <p className="text-xs text-stone-500">Connect Google Calendar to add this appointment to Google.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => requestSave(false)} disabled={busy} variant="outline" className="rounded-xl">
                <Save className="w-4 h-4 mr-1" /> Save to MemoryMate
              </Button>
              <Button
                onClick={() => requestSave(true)}
                disabled={busy || !calendarConnected}
                className="rounded-xl bg-sky-600 hover:bg-sky-700"
                data-testid="appt-ai-save-google"
              >
                <CalendarPlus className="w-4 h-4 mr-1" /> Save + Add to Google Calendar
              </Button>
              <Button variant="ghost" onClick={reset} className="rounded-xl"><X className="w-4 h-4 mr-1" /> Clear</Button>
            </div>
          </div>
        )}

        {phase === "success" && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            Appointment saved. <Button variant="link" className="p-0 h-auto" onClick={reset}>Create another</Button>
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-600" /> Confirm appointment
            </DialogTitle>
            <DialogDescription>Review details before saving. Nothing is created until you confirm.</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1 text-stone-600">
            <p className="font-medium">{fields.title}</p>
            <p>{[fields.date, fields.time].filter(Boolean).join(" · ")}</p>
            {fields.location && <p>{fields.location}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-sky-600 hover:bg-sky-700" onClick={onConfirmSave} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dupModal} onOpenChange={(o) => !o && setDupModal(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Similar appointment found
            </DialogTitle>
            <DialogDescription>This looks similar to an existing appointment.</DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-1">
            {(dupModal?.matches || []).map((m) => (
              <li key={m.id} className="rounded-lg bg-amber-50 px-3 py-2">
                {m.title} · {[m.date, m.time].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDupModal(null)}>Cancel</Button>
            {dupModal?.matches?.[0] && (
              <Button variant="outline" onClick={() => save(dupModal.withGoogle, false, dupModal.matches[0].id)}>
                Update existing
              </Button>
            )}
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => save(dupModal?.withGoogle, true)}>
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
