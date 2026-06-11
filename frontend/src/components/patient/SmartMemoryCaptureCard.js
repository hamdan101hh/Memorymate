import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import { Button } from "../ui/button";
import {
  Radio, Pause, Play, Square, Settings, ClipboardList, BookHeart, Mic, MicOff, Loader2,
} from "lucide-react";
import { toast } from "sonner";

function captureState(status, settings) {
  if (settings?.private_mode) return "off";
  if (status?.review_count > 0 && !status?.always_on) return "needs_review";
  if (status?.always_on && status?.paused) return "paused";
  if (status?.always_on) return "listening";
  return "off";
}

const STATUS_LINES = {
  off: { mic: "Microphone off", hint: "Temporary audio is not saved unless turned into a memory." },
  listening: { mic: "Listening with permission", hint: "Temporary audio is not saved unless turned into a memory." },
  paused: { mic: "Paused", hint: "Temporary audio is not saved unless turned into a memory." },
  processing: { mic: "Processing…", hint: "Review before saving or sharing." },
  needs_review: { mic: "Microphone off", hint: "Some items need your review before saving." },
};

export default function SmartMemoryCaptureCard() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/capture/status").then(({ data }) => setStatus(data)).catch((e) => logError("capture status", e));
  }, []);

  useEffect(() => {
    api.get("/capture/settings").then(({ data }) => setSettings(data)).catch(() => setSettings({}));
    load();
  }, [load]);

  const state = busy ? "processing" : captureState(status, settings);
  const lines = STATUS_LINES[state] || STATUS_LINES.off;
  const micOn = settings?.mic_enabled;
  const locationOn = settings?.location_enabled;

  const pause = async (paused) => {
    setBusy(true);
    try {
      const { data } = await api.post("/capture/always-on/pause", { paused });
      setStatus(data);
    } catch {
      toast.error("Could not update capture");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/capture/always-on/stop");
      setStatus(data);
      toast.success("Smart Capture stopped");
    } catch {
      toast.error("Could not stop capture");
    } finally {
      setBusy(false);
    }
  };

  const startCapture = () => {
    if (!micOn) {
      toast.message("Turn on microphone permission in Capture settings first.");
      navigate("/patient/capture/settings");
      return;
    }
    navigate("/patient/capture/always-on");
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

      <div className="mt-4 rounded-2xl bg-white border border-sky-100 px-4 py-3 space-y-1" data-testid="capture-visible-status">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          {state === "listening" ? <Mic className="w-4 h-4 text-emerald-600" /> : <MicOff className="w-4 h-4 text-stone-400" />}
          {lines.mic}
        </p>
        <p className="text-sm text-stone-600">{lines.hint}</p>
        {locationOn && (
          <p className="text-xs text-stone-500">Location sharing is optional — saved only when you confirm.</p>
        )}
        {state !== "off" && (
          <p className="text-xs font-medium text-sky-700 capitalize" data-testid="capture-state-label">Status: {state.replace("_", " ")}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status?.always_on ? (
          <>
            {status.paused ? (
              <Button size="sm" disabled={busy} onClick={() => pause(false)} className="rounded-xl bg-emerald-600" data-testid="capture-pause-btn">
                <Play className="w-4 h-4 mr-1" /> Resume
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => pause(true)} className="rounded-xl bg-amber-500" data-testid="capture-pause-btn">
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={stop} className="rounded-xl bg-red-600" data-testid="capture-stop-btn">
              <Square className="w-4 h-4 mr-1" /> Stop
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={startCapture} className="rounded-xl bg-sky-600" data-testid="capture-start-btn">
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Radio className="w-4 h-4 mr-1" />}
            Start capture
          </Button>
        )}
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
