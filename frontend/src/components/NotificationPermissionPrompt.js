import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { Bell, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  pushSupported, permissionState, isSubscribed, fetchPushConfig, enablePush,
} from "../lib/push";

const DISMISS_KEY = "mm_notif_prompt_dismissed";

// Calm, dismissible prompt to enable gentle reminders / caregiver updates.
// Shows only when push is supported, configured server-side, not yet enabled,
// permission isn't blocked, and the user hasn't dismissed it. `settingsPath`
// points to the role's Notifications settings page.
export default function NotificationPermissionPrompt({ settingsPath = "/patient/notifications" }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pushSupported() || permissionState() === "denied") return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      try {
        const cfg = await fetchPushConfig();
        if (!cfg.configured) return;
        if (await isSubscribed()) return;
        if (alive) setVisible(true);
      } catch {
        /* if config can't load, stay quiet */
      }
    })();
    return () => { alive = false; };
  }, []);

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setVisible(false); };

  const enable = async () => {
    setBusy(true);
    try {
      await enablePush();
      toast.success("Notifications are on");
      setVisible(false);
    } catch (e) {
      toast.error(e.message || "Could not turn on notifications");
    } finally { setBusy(false); }
  };

  if (!visible) return null;

  return (
    <div className="mb-5 rounded-2xl border-2 border-sky-200 bg-sky-50 p-5" data-testid="notif-permission-prompt">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-sky-600 text-white shrink-0"><Bell className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-stone-800">Turn on gentle notifications?</p>
          <p className="text-sm text-stone-600 mt-0.5">
            MemoryMate can send gentle reminders and caregiver updates. You can change this anytime.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={enable} disabled={busy} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="notif-prompt-enable">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bell className="w-4 h-4 mr-1" />} Enable notifications
            </Button>
            <Button onClick={dismiss} variant="ghost" className="rounded-xl text-stone-600" data-testid="notif-prompt-dismiss">
              Not now
            </Button>
          </div>
          <Link to={settingsPath} className="mt-2 inline-block text-xs text-sky-700 hover:underline">Notification settings</Link>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-stone-400 hover:text-stone-600 shrink-0"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
