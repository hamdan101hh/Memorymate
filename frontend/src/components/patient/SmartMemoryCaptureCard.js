import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import { useSmartDayCapture } from "../../hooks/useSmartDayCapture";
import { Button } from "../ui/button";
import {
  Radio, Pause, Play, Square, Settings, ClipboardList, BookHeart, Mic, MicOff, Loader2, Sun,
} from "lucide-react";
import { toast } from "sonner";

function captureState(status, settings, smartDay, detecting) {
  if (settings?.private_mode) return "off";
  if (smartDay?.voice_limit_reached) return "voice_limit";
  if (smartDay?.draft_count > 0 && !smartDay?.active) return "drafts_ready";
  if (smartDay?.active && smartDay?.paused) return "paused";
  if (smartDay?.active && detecting) return "detecting";
  if (smartDay?.active) return "listening_open";
  if (status?.review_count > 0 && !status?.always_on) return "needs_review";
  if (status?.always_on && status?.paused) return "paused";
  if (status?.always_on) return "listening";
  return "off";
}

const STATUS_LINES = {
  off: { mic: "Microphone off", hint: "Temporary audio is not saved unless turned into a memory." },
  listening_open: { mic: "Listening while app is open", hint: "You review before anything is saved." },
  detecting: { mic: "Detecting speech…", hint: "MemoryMate ignores silence and background noise where possible." },
  paused: { mic: "Paused", hint: "Temporary audio is not saved unless turned into a memory." },
  drafts_ready: { mic: "Drafts ready for review", hint: "Review drafts before saving or sharing." },
  voice_limit: { mic: "Voice limit reached", hint: "You can still type your memory." },
  listening: { mic: "Listening with permission", hint: "Temporary audio is not saved unless turned into a memory." },
  needs_review: { mic: "Microphone off", hint: "Some items need your review before saving." },
  processing: { mic: "Processing…", hint: "Review before saving or sharing." },
};

export default function SmartMemoryCaptureCard() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [smartDay, setSmartDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draftBump, setDraftBump] = useState(0);

  const load = useCallback(() => {
    api.get("/capture/status").then(({ data }) => setStatus(data)).catch((e) => logError("capture status", e));
    api.get("/capture/smart-day/status").then(({ data }) => setSmartDay(data)).catch(() => setSmartDay(null));
  }, []);

  useEffect(() => {
    api.get("/capture/settings").then(({ data }) => setSettings(data)).catch(() => setSettings({}));
    load();
  }, [load, draftBump]);

  const smartDayActive = smartDay?.active && !smartDay?.paused && !smartDay?.voice_limit_reached;

  const { detecting, speechUnsupported, stopRecognition } = useSmartDayCapture({
    enabled: smartDayActive,
    language: settings?.capture_language || "auto",
    minSnippetSeconds: settings?.smart_day_min_snippet_seconds || 3,
    onDraftCreated: () => {
      setDraftBump((n) => n + 1);
      load();
    },
  });

  const state = busy ? "processing" : captureState(status, settings, smartDay, detecting);
  const lines = STATUS_LINES[state] || STATUS_LINES.off;
  const micOn = settings?.mic_enabled;

  const startSmartDay = async () => {
    if (!micOn) {
      toast.message("Turn on microphone permission in Capture settings first.");
      navigate("/patient/capture/settings");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/capture/smart-day/start");
      setSmartDay(data);
      toast.success("Smart Day Capture started");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not start");
    } finally {
      setBusy(false);
    }
  };

  const pauseSmartDay = async (paused) => {
    setBusy(true);
    stopRecognition();
    try {
      const { data } = await api.post("/capture/smart-day/pause", { paused });
      setSmartDay(data);
    } catch {
      toast.error("Could not update");
    } finally {
      setBusy(false);
    }
  };

  const stopSmartDay = async () => {
    setBusy(true);
    stopRecognition();
    try {
      const { data } = await api.post("/capture/smart-day/stop");
      setSmartDay(data);
      toast.success("Smart Day Capture stopped");
    } catch {
      toast.error("Could not stop");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm" data-testid="smart-memory-capture-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-sky-900">Smart Memory Capture</h2>
          <p className="text-sky-800/80 mt-1">Capture useful moments with your permission. Pause anytime.</p>
        </div>
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-sky-600 text-white shrink-0">
          <Radio className="w-6 h-6" />
        </span>
      </div>

      <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4" data-testid="smart-day-section">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <Sun className="w-5 h-5" /> Smart Day Capture
        </div>
        <p className="text-sm text-amber-900/80 mt-1">
          MemoryMate can stay ready while the app is open, detect useful speech moments, ignore silence/background noise,
          and create memory drafts for you to review.
        </p>
        <p className="text-xs text-stone-600 mt-2" data-testid="smart-day-open-note">
          Works while this page is open and microphone permission is allowed.
        </p>
        {speechUnsupported && (
          <p className="text-xs text-amber-800 mt-2" data-testid="speech-fallback-note">
            This browser may not support speech recognition for this language. You can still type your memory.
          </p>
        )}
        {smartDay && (
          <p className="text-xs text-stone-600 mt-2" data-testid="cloud-voice-usage">
            Cloud voice used today: {smartDay.cloud_minutes_used} / {smartDay.cloud_minutes_cap} minutes
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {smartDay?.active ? (
            <>
              {smartDay.paused ? (
                <Button size="sm" disabled={busy} onClick={() => pauseSmartDay(false)} className="rounded-xl bg-emerald-600" data-testid="smart-day-resume-btn">
                  <Play className="w-4 h-4 mr-1" /> Resume
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => pauseSmartDay(true)} className="rounded-xl bg-amber-500" data-testid="smart-day-pause-btn">
                  <Pause className="w-4 h-4 mr-1" /> Pause
                </Button>
              )}
              <Button size="sm" disabled={busy} onClick={stopSmartDay} className="rounded-xl bg-red-600" data-testid="smart-day-stop-btn">
                <Square className="w-4 h-4 mr-1" /> Stop
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startSmartDay} disabled={busy || smartDay?.voice_limit_reached} className="rounded-xl bg-amber-600" data-testid="smart-day-start-btn">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sun className="w-4 h-4 mr-1" />}
              Start Smart Day Capture
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => navigate("/patient/capture/smart-day-drafts")} className="rounded-xl" data-testid="smart-day-review-btn">
            <ClipboardList className="w-4 h-4 mr-1" /> Review drafts
            {smartDay?.draft_count ? ` (${smartDay.draft_count})` : ""}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white border border-sky-100 px-4 py-3 space-y-1" data-testid="capture-visible-status">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          {state === "listening_open" || state === "detecting" || state === "listening"
            ? <Mic className="w-4 h-4 text-emerald-600" /> : <MicOff className="w-4 h-4 text-stone-400" />}
          {lines.mic}
        </p>
        <p className="text-sm text-stone-600">{lines.hint}</p>
        {state !== "off" && (
          <p className="text-xs font-medium text-sky-700 capitalize" data-testid="capture-state-label">
            Status: {state.replace(/_/g, " ")}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate("/patient/capture/review")} className="rounded-xl" data-testid="capture-review-btn">
          <ClipboardList className="w-4 h-4 mr-1" /> Review saved memories
          {status?.review_count ? ` (${status.review_count})` : ""}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/patient/capture/settings")} className="rounded-xl" data-testid="capture-settings-btn">
          <Settings className="w-4 h-4 mr-1" /> Settings
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/patient/memory-book")} className="rounded-xl" data-testid="capture-memory-book-btn">
          <BookHeart className="w-4 h-4 mr-1" /> Memory book
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link to="/patient/capture" className="text-sky-700 font-medium" data-testid="link-focused-capture">Focused capture session</Link>
        <Link to="/patient/meeting" className="text-sky-700 font-medium" data-testid="link-meeting-capture">Meeting Capture</Link>
      </div>
    </div>
  );
}
