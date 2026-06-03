import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api, { formatApiError } from "../../lib/api";
import { Disclaimer } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Radio, Video, ShieldAlert, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const TYPES = [
  { v: "meeting", l: "Meeting" }, { v: "doctor", l: "Doctor appointment" },
  { v: "family_visit", l: "Family visit" }, { v: "phone_call", l: "Phone call summary" },
  { v: "routine", l: "Daily routine check-in" }, { v: "caregiver_checkin", l: "Caregiver check-in" },
  { v: "general", l: "General" },
];

export default function CaptureStart({ mode = "capture" }) {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const isMeeting = mode === "meeting";
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: isMeeting ? "" : "", session_type: isMeeting ? "meeting" : "routine",
    people_involved: "", purpose: "", expected_duration: 30,
    transcript_storage_mode: "summary_only", consent_confirmed: false, informed_others: false,
  });
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const start = async () => {
    if (!f.title.trim()) { toast.error("Please add a title."); return; }
    if (!f.consent_confirmed) { toast.error("Consent is required to start."); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/capture/sessions", { mode, ...f, expected_duration: Number(f.expected_duration) });
      toast.success("Capture session started");
      navigate(`${base}/capture/session/${data.id}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not start session");
    } finally { setSaving(false); }
  };

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="capture-start-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1" data-testid="capture-back-btn">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center gap-3 mb-2">
        <span className={`grid place-items-center w-12 h-12 rounded-2xl text-white ${isMeeting ? "bg-violet-600" : "bg-sky-600"}`}>
          {isMeeting ? <Video className="w-6 h-6" /> : <Radio className="w-6 h-6" />}
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">{isMeeting ? "Meeting Mode" : "Start Memory Capture"}</h1>
      </div>
      <p className="text-stone-600 mb-6">{isMeeting ? "Set up a meeting to capture key points, decisions and action items — with consent." : "Start a focused capture session. By default, only a summary and action items are saved."}</p>

      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
        <div>
          <Label>{isMeeting ? "Meeting title" : "Session title"}</Label>
          <Input value={f.title} onChange={set("title")} placeholder={isMeeting ? "Meeting with Fadi" : "Daily check-in"} className="mt-1 h-11 rounded-xl" data-testid="capture-title-input" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Session type</Label>
            <Select value={f.session_type} onValueChange={set("session_type")}>
              <SelectTrigger className="mt-1 rounded-xl" data-testid="capture-type-select"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Expected duration (minutes)</Label>
            <Input type="number" value={f.expected_duration} onChange={set("expected_duration")} className="mt-1 h-11 rounded-xl" data-testid="capture-duration-input" />
          </div>
        </div>
        <div>
          <Label>People involved</Label>
          <Input value={f.people_involved} onChange={set("people_involved")} placeholder="Fadi Yousufzai, Sarah" className="mt-1 h-11 rounded-xl" data-testid="capture-people-input" />
        </div>
        <div>
          <Label>Purpose</Label>
          <Textarea value={f.purpose} onChange={set("purpose")} placeholder="Discuss MemoryMate app idea and next steps" className="mt-1 rounded-xl" data-testid="capture-purpose-input" />
        </div>
        <div>
          <Label>What to save</Label>
          <Select value={f.transcript_storage_mode} onValueChange={set("transcript_storage_mode")}>
            <SelectTrigger className="mt-1 rounded-xl" data-testid="capture-storage-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="summary_only">Summary & action items only (recommended)</SelectItem>
              <SelectItem value="transcript">Save transcript too</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-stone-400 mt-1">Raw audio is never stored by default.</p>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
          <p className="text-sm text-amber-900 flex gap-2"><ShieldAlert className="w-5 h-5 shrink-0" /> Only use Memory Capture where you have permission. Please inform people nearby that you are capturing.</p>
          <label className="flex items-start gap-2 cursor-pointer text-sm text-stone-700">
            <Checkbox checked={f.informed_others} onCheckedChange={(v) => set("informed_others")(!!v)} className="mt-0.5" data-testid="capture-informed-checkbox" />
            I have informed the people nearby.
          </label>
          <label className="flex items-start gap-2 cursor-pointer text-sm text-stone-700">
            <Checkbox checked={f.consent_confirmed} onCheckedChange={(v) => set("consent_confirmed")(!!v)} className="mt-0.5" data-testid="capture-consent-checkbox" />
            I consent to start this capture session and understand a consent log will be recorded.
          </label>
        </div>

        <Button onClick={start} disabled={saving} className="w-full h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="capture-start-btn">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : isMeeting ? "Start meeting" : "Start capture"}
        </Button>
        <Disclaimer />
      </div>
    </div>
  );
}
