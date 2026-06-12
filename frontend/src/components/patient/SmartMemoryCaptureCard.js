import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { logError } from "../../lib/logger";
import { Button } from "../ui/button";
import {
  Bell, ClipboardList, Loader2, MessageCircle, Moon, Pause, Play,
  Square, SkipForward, Sparkles, Sun,
} from "lucide-react";
import { toast } from "sonner";

export default function SmartMemoryCaptureCard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [captureStatus, setCaptureStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/capture/smart-reminders/status")
      .then(({ data }) => setStatus(data))
      .catch((e) => logError("smart reminders status", e));
    api.get("/capture/status").then(({ data }) => setCaptureStatus(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path, { successMsg, body } = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post(path, body || {});
      setStatus(data);
      if (successMsg) toast.success(successMsg);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const active = status?.active;
  const paused = status?.paused;
  const quietDay = status?.quiet_day;

  return (
    <div className="mt-5 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 shadow-sm" data-testid="smart-memory-capture-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-sky-900" data-testid="smart-capture-title">
            {active ? "Smart Capture Reminders active" : "Smart Capture Reminders"}
          </h2>
          <p className="text-sky-800/80 mt-1 text-sm" data-testid="smart-capture-description">
            {active
              ? "MemoryMate will check in every few hours. You choose what to save. Nothing is recorded unless you tap record."
              : "Get gentle reminders to save important moments. Nothing records unless you choose."}
          </p>
        </div>
        <span className="grid place-items-center w-12 h-12 rounded-2xl bg-sky-600 text-white shrink-0">
          <MessageCircle className="w-6 h-6" />
        </span>
      </div>

      {quietDay && active && (
        <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" data-testid="quiet-day-notice">
          Quiet day mode is on. MemoryMate will keep check-ins minimal today.
        </p>
      )}

      {status?.prompt_due && active && !paused && (
        <div className="mt-4 rounded-2xl bg-violet-50 border border-violet-200 p-4 space-y-3" data-testid="smart-capture-prompt">
          <p className="text-sm font-medium text-violet-900">{status.prompt_message}</p>
          <p className="text-xs text-stone-600">You choose what to save. Pause anytime.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-xl bg-emerald-600" onClick={() => navigate("/patient/record")} data-testid="prompt-record-memory">
              Record memory
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate("/patient/record")} data-testid="prompt-type-note">
              Type note
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate("/patient/reminders")} data-testid="prompt-add-reminder">
              Add reminder
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/skip-next")} data-testid="prompt-skip">
              Skip
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl text-red-700" disabled={busy} onClick={() => act("/capture/smart-reminders/stop", { successMsg: "Reminders turned off" })} data-testid="prompt-turn-off">
              Turn off reminders
            </Button>
          </div>
        </div>
      )}

      {status?.suggest_quiet_day && active && (
        <div className="mt-4 rounded-2xl bg-stone-50 border border-stone-200 p-4 space-y-2" data-testid="suggest-quiet-day">
          <p className="text-sm text-stone-800">Want fewer check-ins today?</p>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/quiet-day", { successMsg: "Quiet day on" })} data-testid="accept-quiet-day">
              Yes, quiet day
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/skip-next")} data-testid="decline-quiet-day">
              No, keep reminders
            </Button>
          </div>
        </div>
      )}

      {active && (
        <div className="mt-4 rounded-2xl bg-white border border-sky-100 px-4 py-3 space-y-1 text-sm text-stone-700" data-testid="smart-capture-active-meta">
          <p><span className="font-semibold">Time remaining:</span> {status.time_remaining_label}</p>
          {status.next_prompt_at && (
            <p data-testid="next-reminder-time">
              <span className="font-semibold">Next check-in:</span> {new Date(status.next_prompt_at).toLocaleString()}
            </p>
          )}
          <p data-testid="reminder-frequency">
            <span className="font-semibold">Reminder frequency:</span> every {status.schedule_interval_hours} hours
            {status.weekend_schedule ? " (weekend)" : " (weekday)"}
          </p>
          <p className="text-xs text-stone-500 mt-1" data-testid="no-auto-record-note">
            Capture reminders only — nothing is recorded unless you tap record.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!active ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => act("/capture/smart-reminders/start", { successMsg: "Smart Capture Reminders on for 24 hours" })}
            className="rounded-xl bg-sky-600 hover:bg-sky-700"
            data-testid="smart-capture-start-24h"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sun className="w-4 h-4 mr-1" />}
            Turn on for 24 hours
          </Button>
        ) : (
          <>
            <Button size="sm" className="rounded-xl bg-emerald-600" onClick={() => navigate("/patient/record")} data-testid="capture-now-btn">
              <Sparkles className="w-4 h-4 mr-1" /> Capture now
            </Button>
            {paused ? (
              <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/pause", { body: { paused: false }, successMsg: "Reminders resumed" })} data-testid="resume-reminders-btn">
                <Play className="w-4 h-4 mr-1" /> Resume reminders
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/pause", { body: { paused: true } })} data-testid="pause-reminders-btn">
                <Pause className="w-4 h-4 mr-1" /> Pause reminders
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/skip-next")} data-testid="skip-next-reminder-btn">
              <SkipForward className="w-4 h-4 mr-1" /> Skip next reminder
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/skip-today", { successMsg: "Skipped for today" })} data-testid="skip-today-btn">
              Skip today
            </Button>
            {!quietDay && (
              <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("/capture/smart-reminders/quiet-day", { successMsg: "Quiet day on" })} data-testid="quiet-day-btn">
                <Moon className="w-4 h-4 mr-1" /> Quiet day
              </Button>
            )}
            <Button size="sm" variant="outline" className="rounded-xl text-red-700" disabled={busy} onClick={() => act("/capture/smart-reminders/stop", { successMsg: "Reminders turned off" })} data-testid="turn-off-reminders-btn">
              <Square className="w-4 h-4 mr-1" /> Turn off
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => navigate("/patient/capture/review")} className="rounded-xl" data-testid="capture-review-btn">
          <ClipboardList className="w-4 h-4 mr-1" /> Review
          {captureStatus?.review_count ? ` (${captureStatus.review_count})` : ""}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/patient/reminders")} className="rounded-xl" data-testid="open-reminders-btn">
          <Bell className="w-4 h-4 mr-1" /> Reminders
        </Button>
      </div>

      <p className="mt-3 text-xs text-stone-500" data-testid="smart-capture-web-note">
        Works while you use MemoryMate in this browser. Reminders do not record or listen automatically.
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <Link to="/patient/capture" className="text-sky-700 font-medium" data-testid="link-focused-capture">Focused capture session</Link>
        <Link to="/patient/capture/settings" className="text-sky-700 font-medium" data-testid="link-capture-settings">Capture settings</Link>
      </div>
    </div>
  );
}
