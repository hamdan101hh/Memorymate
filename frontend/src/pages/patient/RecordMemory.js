import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Mic, Square, Loader2, Save, Sparkles, CheckCircle2, Bell, Users, Pill } from "lucide-react";
import { toast } from "sonner";

export default function RecordMemory() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [source, setSource] = useState("manual");
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendForTranscription(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Microphone not available. You can type your memory instead.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const sendForTranscription = async (blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "memory.webm");
      const { data } = await api.post("/memories/transcribe", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setTranscript((prev) => (prev ? prev + " " : "") + data.transcript);
      setSource("voice");
      toast.success("Recording transcribed. Review and save.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not transcribe. Please type instead.");
    } finally {
      setTranscribing(false);
    }
  };

  const save = async () => {
    if (!transcript.trim()) { toast.error("Please record or type a memory first."); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/memories", { transcript, source });
      setResult(data);
      toast.success("Memory saved.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to save memory.");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="mm-fade-up">
        <PatientPageHeader title="Memory saved" />
        <div className="rounded-3xl bg-emerald-50 border-2 border-emerald-200 p-6 flex items-start gap-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
          <div>
            <h2 className="font-heading text-xl font-semibold text-emerald-800">{result.title}</h2>
            <p className="mt-2 text-lg text-stone-700 leading-relaxed">{result.simple_summary}</p>
          </div>
        </div>

        <Extracted icon={Bell} label="Reminders" color="text-violet-600"
          items={result.tasks_detected?.map((t) => t.title)} />
        <Extracted icon={Users} label="People mentioned" color="text-rose-500"
          items={result.people_mentioned?.map((p) => `${p.name}${p.relationship ? ` (${p.relationship})` : ""}`)} />
        <Extracted icon={Pill} label="Medication notes" color="text-emerald-600"
          items={result.medication_detected?.map((m) => `${m.name}${m.instruction ? ` — ${m.instruction}` : ""}`)} />

        <div className="mt-7 flex gap-3">
          <Button onClick={() => { setResult(null); setTranscript(""); }} variant="outline" className="flex-1 h-13 py-3 rounded-2xl text-base" data-testid="record-another-btn">Record another</Button>
          <Button onClick={() => navigate("/patient/today")} className="flex-1 h-13 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="view-today-btn">View Today's Summary</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-fade-up" data-testid="record-memory-page">
      <PatientPageHeader title="Record a Memory" subtitle="Tell me about your day, or type it below." />

      <div className="rounded-3xl bg-white border-2 border-stone-200 p-8 text-center">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          data-testid="record-toggle-btn"
          className={`grid place-items-center w-28 h-28 rounded-full mx-auto text-white shadow-lg transition-all active:scale-95 ${
            recording ? "bg-red-600 animate-pulse" : "bg-sky-600 hover:bg-sky-700"}`}>
          {transcribing ? <Loader2 className="w-12 h-12 animate-spin" /> : recording ? <Square className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
        </button>
        <p className="mt-5 text-xl font-semibold">
          {transcribing ? "Transcribing…" : recording ? "Listening… tap to stop" : "Tap to start recording"}
        </p>
        <p className="text-stone-500 mt-1">Your voice will be turned into text you can review.</p>
      </div>

      <div className="mt-6">
        <label className="text-lg font-semibold">Or type your memory</label>
        <Textarea
          value={transcript}
          onChange={(e) => { setTranscript(e.target.value); if (source !== "voice") setSource("manual"); }}
          placeholder="Example: Today my daughter Sarah came to visit me. We went to the clinic at 3 PM. The doctor told me to take my blood pressure medicine every morning."
          className="mt-2 min-h-[160px] rounded-2xl text-lg p-4"
          data-testid="transcript-input"
        />
      </div>

      <Button onClick={save} disabled={saving || transcribing} className="mt-6 w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-lg" data-testid="save-memory-btn">
        {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating summary…</> : <><Sparkles className="w-5 h-5 mr-2" /> Save Memory</>}
      </Button>
    </div>
  );
}

function Extracted({ icon: Icon, label, items, color }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-5 rounded-2xl bg-white border border-stone-200 p-5">
      <div className={`flex items-center gap-2 font-semibold ${color}`}><Icon className="w-5 h-5" /> {label}</div>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="text-lg text-stone-700 flex items-start gap-2"><span className="text-stone-300 mt-1">•</span> {it}</li>
        ))}
      </ul>
    </div>
  );
}
