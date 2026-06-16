import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import PhotoAttachmentPicker from "../../components/PhotoAttachmentPicker";
import {
  Circle, Loader2, Pause, Play, Square, Trash2, Save, MicOff,
} from "lucide-react";
import { toast } from "sonner";

function formatTimer(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function FocusCapture() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState(null);
  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [savePermission, setSavePermission] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [attachedImages, setAttachedImages] = useState([]);
  const timerRef = useRef(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const streamRef = useRef(null);

  const loadConfig = useCallback(async () => {
    const { data } = await api.get("/focus-capture/config");
    setConfig(data);
  }, []);

  useEffect(() => {
    loadConfig().catch(() => toast.error("Could not load Focus Capture settings"));
  }, [loadConfig]);

  useEffect(() => {
    if (!session || session.status !== "active") {
      setDisplaySeconds(session?.live_duration_seconds ?? session?.duration_seconds ?? 0);
      if (timerRef.current) clearInterval(timerRef.current);
      return undefined;
    }
    const base = session.accumulated_seconds || 0;
    const started = Date.now();
    const tick = () => setDisplaySeconds(Math.floor(base + (Date.now() - started) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [session?.id, session?.status, session?.accumulated_seconds]);

  const stopMicStream = () => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const tryMicIndicator = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicBlocked(false);
    } catch {
      setMicBlocked(true);
    }
  };

  const startSession = async () => {
    if (!consent) {
      toast.error("Please confirm consent before starting.");
      return;
    }
    setLoading(true);
    try {
      await tryMicIndicator();
      const { data } = await api.post("/focus-capture/session/start", {
        title: "Focus Capture session",
        consent_confirmed: true,
      });
      setSession(data);
      setDisplaySeconds(0);
      toast.success("Focus Capture started");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const patchSession = async (action) => {
    if (!session?.id) return;
    setLoading(true);
    try {
      const { data } = await api.patch(`/focus-capture/session/${session.id}/${action}`);
      setSession(data);
      if (action === "stop") stopMicStream();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    if (!session?.id) return;
    try {
      const { data } = await api.patch(`/focus-capture/session/${session.id}/notes`, {
        notes_text: notes,
        transcript_text: transcript,
      });
      setSession(data);
    } catch {
      /* debounced optional */
    }
  };

  const saveMemory = async () => {
    if (!session?.id) return;
    if (attachedImages.length && !savePermission) {
      toast.error("Please confirm permission to save attached photos.");
      return;
    }
    setLoading(true);
    try {
      await saveNotes();
      const { data } = await api.post(`/focus-capture/session/${session.id}/save-memory`, {
        title: session.title,
        permission_confirmed: savePermission || attachedImages.length === 0,
      });
      setSession(data.session);
      stopMicStream();
      toast.success("Saved as memory");
      navigate("/patient");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async () => {
    if (!session?.id) return;
    setLoading(true);
    try {
      await api.delete(`/focus-capture/session/${session.id}`);
      stopMicStream();
      setSession(null);
      setConsent(false);
      toast.success("Session deleted");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!config.enabled) {
    return (
      <div data-testid="focus-capture-page">
        <PatientPageHeader title="Focus Capture" subtitle="Manual note sessions for class, meetings, or appointments." />
        <p className="text-stone-600 bg-stone-100 border border-stone-200 rounded-xl p-4">
          Focus Capture is not enabled yet. An admin can turn it on for testing from the Costs &amp; Usage dashboard.
        </p>
      </div>
    );
  }

  const isActive = session?.status === "active";
  const isPaused = session?.status === "paused";
  const isStopped = session?.status === "stopped";
  const canEdit = isActive || isPaused || isStopped;

  return (
    <div data-testid="focus-capture-page">
      <PatientPageHeader
        title="Focus Capture"
        subtitle="Start a focused note session for a class, meeting, appointment, or conversation."
      />

      <p className="text-sm text-stone-600 mb-4">
        Your assistant helps you capture notes — not medical advice. You start and stop the session yourself.
      </p>

      {!session && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(!!v)}
              data-testid="focus-capture-consent"
            />
            <span>
              I understand this starts only when I press Start and I can stop anytime.
            </span>
          </label>
          <Button
            size="lg"
            className="w-full rounded-xl text-lg h-14"
            onClick={startSession}
            disabled={loading || !consent}
            data-testid="focus-capture-start-btn"
          >
            Start Focus Capture
          </Button>
        </div>
      )}

      {session && (
        <>
          {(isActive || isPaused) && (
            <div
              className={`mb-4 p-4 rounded-xl border flex items-center gap-3 ${
                isActive ? "bg-sky-50 border-sky-200 text-sky-900" : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
              data-testid="focus-capture-active-banner"
            >
              {isActive && <Circle className="w-5 h-5 fill-red-500 text-red-500 animate-pulse shrink-0" />}
              <div>
                <p className="font-semibold">
                  {isActive ? "Focus Capture is active" : "Focus Capture is paused"}
                </p>
                <p className="text-sm">Timer: {formatTimer(displaySeconds)} — no hidden listening</p>
              </div>
            </div>
          )}

          {micBlocked && (
            <p className="mb-4 text-sm text-stone-700 bg-stone-100 border border-stone-200 rounded-xl p-3 flex gap-2" data-testid="mic-blocked-msg">
              <MicOff className="w-5 h-5 shrink-0" />
              Microphone permission was not granted. You can still type notes and attach photos.
            </p>
          )}

          {canEdit && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {isActive && (
                  <Button variant="outline" onClick={() => patchSession("pause")} disabled={loading} data-testid="focus-capture-pause-btn">
                    <Pause className="w-4 h-4 mr-1" /> Pause
                  </Button>
                )}
                {isPaused && (
                  <Button variant="outline" onClick={() => patchSession("resume")} disabled={loading} data-testid="focus-capture-resume-btn">
                    <Play className="w-4 h-4 mr-1" /> Resume
                  </Button>
                )}
                {(isActive || isPaused) && (
                  <Button variant="outline" onClick={() => patchSession("stop")} disabled={loading} data-testid="focus-capture-stop-btn">
                    <Square className="w-4 h-4 mr-1" /> Stop
                  </Button>
                )}
              </div>

              <Textarea
                placeholder="Type your session notes here…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={5}
                className="text-base"
                data-testid="focus-capture-notes"
              />

              <Textarea
                placeholder="Optional local transcript (typed or pasted — not sent to cloud transcription)"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                className="text-sm"
                data-testid="focus-capture-transcript"
              />

              <PhotoAttachmentPicker
                linkedType="focus_capture"
                linkedId={session.id}
                onImagesChange={setAttachedImages}
                sectionTitle="Attach photo"
                sectionSubtitle="Link a photo to this session. Describe it manually — no OCR."
              />

              {attachedImages.length > 0 && (
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={savePermission} onCheckedChange={(v) => setSavePermission(!!v)} />
                  <span>I have permission to save these photos with my memory.</span>
                </label>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={saveMemory} disabled={loading} className="rounded-xl" data-testid="focus-capture-save-memory-btn">
                  <Save className="w-4 h-4 mr-1" /> Save as Memory
                </Button>
                <Button variant="destructive" onClick={deleteSession} disabled={loading} className="rounded-xl" data-testid="focus-capture-delete-btn">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete session
                </Button>
              </div>
            </div>
          )}

          {session.status === "saved" && (
            <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              Session saved as a memory. You can return to home.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-stone-500 mt-6">
        Audio is not stored on the server in this MVP. Cloud transcription is disabled.
      </p>
    </div>
  );
}
