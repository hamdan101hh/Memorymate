import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api, { formatApiError } from "../lib/api";
import {
  pushSupported, permissionState, enablePush, disablePush, isSubscribed, sendTestPush,
} from "../lib/push";
import { Disclaimer } from "../components/common";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Input } from "../components/ui/input";
import {
  Bell, BellRing, BellOff, ArrowLeft, Loader2, Send, ShieldCheck, Moon,
  AlarmClock, AlertTriangle, CalendarCheck, ShieldQuestion, Radio, Info,
} from "lucide-react";
import { toast } from "sonner";

export default function NotificationSettings() {
  const { user } = useAuth();
  const role = user?.role || "patient";
  const base = role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState(null);
  const [config, setConfig] = useState({ configured: false });
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState(permissionState());
  const [busy, setBusy] = useState(false);

  const supported = pushSupported();

  const load = useCallback(async () => {
    try {
      const [{ data: cfg }, { data: p }] = await Promise.all([
        api.get("/notifications/config"),
        api.get("/notifications/preferences"),
      ]);
      setConfig(cfg);
      setPrefs(p);
    } catch (e) {
      toast.error("Could not load notification settings");
    }
    if (supported) setSubscribed(await isSubscribed());
  }, [supported]);

  useEffect(() => { load(); }, [load]);

  const update = async (patch) => {
    setPrefs((cur) => ({ ...cur, ...patch }));
    try { await api.patch("/notifications/preferences", patch); }
    catch { toast.error("Could not save"); load(); }
  };

  const onEnable = async () => {
    setBusy(true);
    try {
      await enablePush();
      setSubscribed(true);
      setPerm(permissionState());
      toast.success("Notifications are on");
    } catch (e) {
      toast.error(e.message || "Could not turn on notifications");
      setPerm(permissionState());
    } finally { setBusy(false); }
  };

  const onDisable = async () => {
    setBusy(true);
    try { await disablePush(); setSubscribed(false); toast.success("Notifications turned off on this device"); }
    catch { toast.error("Could not turn off notifications"); }
    finally { setBusy(false); }
  };

  const onTest = async () => {
    setBusy(true);
    try { await sendTestPush(); toast.success("Test notification sent"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not send test"); }
    finally { setBusy(false); }
  };

  if (!prefs) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  // What blocks push, if anything (clear, calm fallback messaging).
  const fallback = !supported
    ? "This browser or device doesn't support push notifications. You'll still see reminders inside the app, and caregivers can receive WhatsApp summaries."
    : !config.configured
      ? "Push notifications aren't switched on for this server yet. Reminders still appear inside the app."
      : perm === "denied"
        ? "Notifications are blocked in your browser settings. Please allow notifications for this site, then try again."
        : null;

  const patientToggles = [
    { key: "patient_reminders", icon: AlarmClock, label: "Reminder notifications", help: "Gentle reminders for your saved reminders." },
    { key: "daily_summary", icon: CalendarCheck, label: "Daily summary ready", help: "A note when your day's summary is ready to read." },
    { key: "capture_status_reminders", icon: Radio, label: "Capture status reminders", help: "An occasional, friendly note when Memory Capture is on." },
  ];
  const caregiverToggles = [
    { key: "caregiver_alerts", icon: BellRing, label: "Caregiver alerts", help: "Important alerts about your loved one." },
    { key: "missed_reminder_alerts", icon: AlertTriangle, label: "Missed important reminders", help: "If a high-priority reminder is missed." },
    { key: "privacy_review_alerts", icon: ShieldQuestion, label: "Privacy Review pending", help: "When items are waiting for your review." },
    { key: "daily_summary", icon: CalendarCheck, label: "Daily summary ready", help: "A note when the day's summary is ready." },
  ];
  const toggles = role === "patient" ? patientToggles : caregiverToggles;

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="notification-settings-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-2">Notifications</h1>
      <p className="text-stone-600 mb-6">Calm, helpful reminders — nothing noisy. You're always in control.</p>

      {/* Enable / status card */}
      <div className={`rounded-2xl border-2 p-5 mb-5 ${subscribed ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-white"}`} data-testid="push-enable-card">
        <div className="flex items-start gap-3">
          <span className={`grid place-items-center w-11 h-11 rounded-xl shrink-0 ${subscribed ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"}`}>
            {subscribed ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </span>
          <div className="flex-1">
            <p className="font-semibold">{subscribed ? "Notifications are on for this device" : "Turn on notifications"}</p>
            <p className="text-sm text-stone-600 mt-0.5">
              {subscribed
                ? "You'll get gentle reminders and updates on this device."
                : "Get gentle reminders and updates right on this device."}
            </p>

            {fallback ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800" data-testid="push-fallback">
                <Info className="w-4 h-4 mt-0.5 shrink-0" /> <span>{fallback}</span>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {!subscribed ? (
                  <Button onClick={onEnable} disabled={busy} className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="push-enable-btn">
                    {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Bell className="w-4 h-4 mr-1" />} Turn on notifications
                  </Button>
                ) : (
                  <>
                    <Button onClick={onTest} disabled={busy} variant="outline" className="rounded-xl" data-testid="push-test-btn">
                      <Send className="w-4 h-4 mr-1" /> Send test
                    </Button>
                    <Button onClick={onDisable} disabled={busy} variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50" data-testid="push-disable-btn">
                      <BellOff className="w-4 h-4 mr-1" /> Turn off on this device
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-type preferences */}
      <Card title="What to notify me about">
        {toggles.map(({ key, icon, label, help }) => (
          <Row key={key} icon={icon} label={label} help={help}>
            <Switch checked={!!prefs[key]} onCheckedChange={(v) => update({ [key]: v })} data-testid={`pref-${key}`} />
          </Row>
        ))}
      </Card>

      {/* Quiet hours */}
      <Card title="Quiet hours">
        <Row icon={Moon} label="Pause notifications overnight" help="No notifications are sent during these hours.">
          <Switch checked={!!prefs.quiet_hours_enabled} onCheckedChange={(v) => update({ quiet_hours_enabled: v })} data-testid="pref-quiet-hours" />
        </Row>
        {prefs.quiet_hours_enabled && (
          <div className="flex items-center gap-3 py-3 pl-8">
            <label className="text-sm text-stone-600">From</label>
            <Input type="time" value={prefs.quiet_hours_start} onChange={(e) => update({ quiet_hours_start: e.target.value })} className="w-32 rounded-xl" data-testid="pref-quiet-start" />
            <label className="text-sm text-stone-600">to</label>
            <Input type="time" value={prefs.quiet_hours_end} onChange={(e) => update({ quiet_hours_end: e.target.value })} className="w-32 rounded-xl" data-testid="pref-quiet-end" />
          </div>
        )}
      </Card>

      <div className="rounded-xl bg-white border border-stone-200 p-5">
        <div className="flex items-center gap-2 font-semibold mb-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Calm by design</div>
        <p className="text-sm text-stone-600 mb-2">
          Reminders are worded gently (for example, “It may be time for your saved reminder”). MemoryMate never gives medical advice — it only repeats reminders you or your family saved. Caregiver summaries and important alerts may also be sent on WhatsApp.
        </p>
        <Disclaimer />
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-5">
      <h2 className="font-heading font-semibold mb-2">{title}</h2>
      <div className="divide-y divide-stone-100">{children}</div>
    </div>
  );
}
function Row({ icon: Icon, label, help, children }) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <span className="flex items-start gap-3 text-stone-700">
        <Icon className="w-5 h-5 text-stone-400 mt-0.5 shrink-0" />
        <span>
          <span className="block">{label}</span>
          {help && <span className="block text-xs text-stone-400 mt-0.5">{help}</span>}
        </span>
      </span>
      {children}
    </div>
  );
}
