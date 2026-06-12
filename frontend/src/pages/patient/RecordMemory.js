import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { logError } from "../../lib/logger";
import { getCurrentLocation } from "../../lib/geolocation";
import { formatCoordsLabel } from "../../lib/mapLinks";
import {
  CAPTURE_LANGUAGES, speechRecognitionSupported, getSpeechRecognitionCtor, localeForCaptureLanguage,
} from "../../lib/captureLanguage";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Mic, Square, Loader2, Sparkles, CheckCircle2, Bell, Users, Pill, MapPin, Type, X } from "lucide-react";
import { toast } from "sonner";
import MemoryImageAttachments from "../../components/MemoryImageAttachments";

export default function RecordMemory() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("input"); // input | review | saved
  const [inputMode, setInputMode] = useState("type"); // type | speak
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [source, setSource] = useState("manual");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [attachLocation, setAttachLocation] = useState(false);
  const [locationPreview, setLocationPreview] = useState(null);
  const [captureLanguage, setCaptureLanguage] = useState("auto");
  const [speechUnsupported, setSpeechUnsupported] = useState(false);
  const [attachedImages, setAttachedImages] = useState([]);
  const [savePermission, setSavePermission] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const speechRef = useRef(null);

  useEffect(() => {
    api.get("/capture/settings")
      .then(({ data }) => {
        setLocationEnabled(!!data.location_enabled);
        setCaptureLanguage(data.capture_language || "auto");
      })
      .catch((e) => logError("Failed to load settings", e));
  }, []);

  const stopSpeech = () => {
    speechRef.current?.stop?.();
    speechRef.current = null;
  };

  const startBrowserSpeech = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSpeechUnsupported(true);
      toast.message("This browser may not support speech recognition for this language. You can still type your memory.");
      return;
    }
    const locale = localeForCaptureLanguage(captureLanguage);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    if (locale) rec.lang = locale;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (text) {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text).trim());
        setSource("voice");
      }
    };
    rec.onerror = () => {
      setSpeechUnsupported(true);
      toast.message("Speech recognition stopped. You can still type your memory.");
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    speechRef.current = rec;
    rec.start();
    setRecording(true);
    setSpeechUnsupported(false);
  };

  const startRecording = async () => {
    if (speechRecognitionSupported()) {
      startBrowserSpeech();
      return;
    }
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
      mediaRef.current._startTime = Date.now();
      setRecording(true);
    } catch {
      toast.error("Microphone not available. You can type your memory instead.");
    }
  };

  const stopRecording = () => {
    if (speechRef.current) {
      stopSpeech();
    } else {
      mediaRef.current?.stop();
    }
    setRecording(false);
  };

  const sendForTranscription = async (blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "memory.webm");
      fd.append("cloud_confirmed", "true");
      if (mediaRef.current?._startTime) {
        fd.append("duration_seconds", String((Date.now() - mediaRef.current._startTime) / 1000));
      }
      const { data } = await api.post("/memories/transcribe", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setTranscript((prev) => (prev ? `${prev} ` : "") + data.transcript);
      setSource("voice");
      toast.success("Temporary audio transcribed. Review before saving.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not transcribe. Please type instead.");
    } finally {
      setTranscribing(false);
    }
  };

  const enhance = async () => {
    if (!transcript.trim()) {
      toast.error("Add some text first.");
      return;
    }
    setEnhancing(true);
    try {
      const imageIds = attachedImages.map((i) => i.id);
      const { data } = await api.post("/memories/draft", { transcript: transcript.trim(), image_ids: imageIds });
      setDraft(data.draft);
      setPhase("review");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not enhance. Try saving without AI.");
    } finally {
      setEnhancing(false);
    }
  };

  const previewLocation = async () => {
    const loc = await getCurrentLocation();
    if (!loc) {
      toast.error("Could not read location. Check browser permission.");
      return;
    }
    setLocationPreview({
      lat: loc.lat,
      lng: loc.lng,
      label: formatCoordsLabel(loc.lat, loc.lng),
    });
    setAttachLocation(true);
  };

  const saveWithDraft = async (skipAi = false) => {
    if (!transcript.trim() && !skipAi) {
      toast.error("Nothing to save.");
      return;
    }
    setSaving(true);
    try {
      let location = null;
      if (locationEnabled && attachLocation && locationPreview) {
        location = locationPreview;
      }
      const imageIds = attachedImages.map((i) => i.id);
      if (imageIds.length && !savePermission) {
        toast.error("Please confirm you have permission to save attached photos.");
        setSaving(false);
        return;
      }
      const body = {
        transcript: skipAi ? transcript.trim() : transcript.trim(),
        source,
        location,
        skip_ai: skipAi,
        use_draft: skipAi ? null : draft,
        title: skipAi ? undefined : draft?.title,
        image_ids: imageIds,
        permission_confirmed: imageIds.length ? savePermission : false,
      };
      const { data } = await api.post("/memories", body);
      setResult(data);
      setPhase("saved");
      toast.success("Memory saved.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to save memory.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    stopRecording();
    setPhase("input");
    setDraft(null);
    setTranscript("");
    setLocationPreview(null);
    setAttachLocation(false);
    setAttachedImages([]);
    setSavePermission(false);
  };

  if (phase === "saved" && result) {
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
        <Extracted icon={Bell} label="Reminders" color="text-violet-600" items={result.tasks_detected?.map((t) => t.title)} />
        <Extracted icon={Users} label="People mentioned" color="text-rose-500"
          items={result.people_mentioned?.map((p) => `${p.name}${p.relationship ? ` (${p.relationship})` : ""}`)} />
        <Extracted icon={Pill} label="Medication notes" color="text-emerald-600"
          items={result.medication_detected?.map((m) => `${m.name}${m.instruction ? ` — ${m.instruction}` : ""}`)} />
        <div className="mt-7 flex gap-3">
          <Button onClick={() => { setResult(null); cancel(); }} variant="outline" className="flex-1 h-13 py-3 rounded-2xl text-base" data-testid="record-another-btn">Record another</Button>
          <Button onClick={() => navigate("/patient/today")} className="flex-1 h-13 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="view-today-btn">View Today's Summary</Button>
        </div>
      </div>
    );
  }

  if (phase === "review" && draft) {
    return (
      <div className="mm-fade-up" data-testid="record-review-phase">
        <PatientPageHeader title="Review before saving" subtitle="Review before saving or sharing." />
        <div className="rounded-3xl bg-white border-2 border-stone-200 p-6 space-y-4">
          <div>
            <p className="text-sm text-stone-500">Title</p>
            <p className="text-xl font-semibold">{draft.title}</p>
          </div>
          <div>
            <p className="text-sm text-stone-500">Summary</p>
            <p className="text-lg text-stone-700">{draft.simple_summary}</p>
          </div>
          {draft.people?.length > 0 && (
            <p className="text-sm"><span className="text-stone-500">People:</span> {draft.people.map((p) => p.name).join(", ")}</p>
          )}
          {draft.places?.length > 0 && (
            <p className="text-sm"><span className="text-stone-500">Places:</span> {draft.places.map((p) => p.name).join(", ")}</p>
          )}
          {locationPreview && (
            <p className="text-sm flex items-center gap-1 text-sky-700"><MapPin className="w-4 h-4" /> {locationPreview.label}</p>
          )}
        </div>
        {attachedImages.length > 0 && (
          <label className="mt-4 flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
            <input type="checkbox" checked={savePermission} onChange={(e) => setSavePermission(e.target.checked)} data-testid="save-photo-permission" />
            I have permission to save attached photos with this memory.
          </label>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={() => saveWithDraft(false)} disabled={saving} className="h-14 rounded-2xl bg-emerald-600 text-lg" data-testid="save-memory-btn">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save memory"}
          </Button>
          <Button onClick={() => setPhase("input")} variant="outline" className="h-12 rounded-2xl" data-testid="back-to-edit-btn">Back to edit</Button>
          <Button onClick={cancel} variant="ghost" className="h-12 rounded-2xl" data-testid="cancel-review-btn"><X className="w-4 h-4 mr-1" /> Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-fade-up" data-testid="record-memory-page">
      <PatientPageHeader title="Record a Memory" subtitle="Type or speak — enhance with AI, then review before saving." />

      <div className="flex gap-2 mb-4">
        <Button variant={inputMode === "type" ? "default" : "outline"} onClick={() => setInputMode("type")} className="rounded-xl" data-testid="input-mode-type">
          <Type className="w-4 h-4 mr-1" /> Type
        </Button>
        <Button variant={inputMode === "speak" ? "default" : "outline"} onClick={() => setInputMode("speak")} className="rounded-xl" data-testid="input-mode-speak">
          <Mic className="w-4 h-4 mr-1" /> Speak
        </Button>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-stone-600">Capture language</label>
        <Select value={captureLanguage} onValueChange={(v) => {
          setCaptureLanguage(v);
          api.patch("/capture/settings", { capture_language: v }).catch(() => {});
        }}>
          <SelectTrigger className="mt-1 rounded-xl" data-testid="capture-language-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CAPTURE_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {speechUnsupported && (
          <p className="mt-2 text-sm text-amber-700" data-testid="speech-fallback-note">
            This browser may not support speech recognition for this language. You can still type your memory.
          </p>
        )}
      </div>

      {inputMode === "speak" && (
        <div className="rounded-3xl bg-white border-2 border-stone-200 p-8 text-center mb-6">
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            data-testid="record-toggle-btn"
            className={`grid place-items-center w-28 h-28 rounded-full mx-auto text-white shadow-lg transition-all active:scale-95 ${
              recording ? "bg-red-600 animate-pulse" : "bg-sky-600 hover:bg-sky-700"}`}>
            {transcribing ? <Loader2 className="w-12 h-12 animate-spin" /> : recording ? <Square className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
          </button>
          <p className="mt-5 text-xl font-semibold">
            {transcribing ? "Transcribing…" : recording ? "Listening with permission — tap to stop" : "Tap to speak (microphone access is optional)"}
          </p>
          <p className="text-stone-500 mt-1 text-sm">Temporary audio is not saved unless turned into a memory.</p>
        </div>
      )}

      <div>
        <label className="text-lg font-semibold">Your memory</label>
        <Textarea
          value={transcript}
          onChange={(e) => { setTranscript(e.target.value); if (source !== "voice") setSource("manual"); }}
          placeholder="Example: Today my daughter Sarah came to visit. We went to the clinic at 3 PM."
          className="mt-2 min-h-[160px] rounded-2xl text-lg p-4"
          data-testid="transcript-input"
        />
      </div>

      <div className="mt-5">
        <MemoryImageAttachments
          onImagesChange={setAttachedImages}
          sectionTitle="Memory photos"
          sectionSubtitle="Add a photo of notes, a place, or a document to help MemoryMate create a better summary."
        />
      </div>

      {locationEnabled && (
        <div className="mt-5 rounded-2xl bg-white border-2 border-stone-200 p-4 space-y-3" data-testid="record-location-section">
          <p className="text-sm text-stone-600">Location is optional and only saved when you confirm.</p>
          {locationPreview ? (
            <p className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-600" /> {locationPreview.label}</p>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAttachLocation(false)} className="rounded-xl" data-testid="location-no-btn">No location</Button>
              <Button onClick={previewLocation} className="rounded-xl bg-sky-600" data-testid="location-add-btn">Add location</Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <Button onClick={enhance} disabled={enhancing || transcribing} className="h-14 rounded-2xl bg-violet-600 hover:bg-violet-700 text-lg" data-testid="enhance-btn">
          {enhancing ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
          Enhance with AI
        </Button>
        <Button onClick={() => saveWithDraft(true)} disabled={saving || transcribing} variant="outline" className="h-12 rounded-2xl text-base" data-testid="save-without-ai-btn">
          Save without AI
        </Button>
        <Button onClick={cancel} variant="ghost" className="h-12 rounded-2xl" data-testid="cancel-record-btn">Cancel</Button>
      </div>
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
          <li key={`${label}-${i}`} className="text-lg text-stone-700 flex items-start gap-2"><span className="text-stone-300 mt-1">•</span> {it}</li>
        ))}
      </ul>
    </div>
  );
}
