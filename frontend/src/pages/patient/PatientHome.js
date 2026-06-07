import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import NotificationPermissionPrompt from "../../components/NotificationPermissionPrompt";
import {
  Mic, MessageCircleHeart, Sun, Bell, Users, Phone, Radio, Video, EyeOff, BookHeart,
  Infinity as InfinityIcon, Pause, Play, Square, Trash2, ClipboardList, Clock,
} from "lucide-react";
import { toast } from "sonner";

const DURATION_LABEL = {
  "1d": "For 1 day", "1w": "For 1 week", "1m": "For 1 month",
  until_off: "Until turned off", custom: "Custom end date",
};

function humanRemaining(secs) {
  if (secs == null) return null;
  if (secs <= 0) return "ending now";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d} day${d > 1 ? "s" : ""}${h ? ` ${h} hr` : ""} left`;
  if (h > 0) return `${h} hr${m ? ` ${m} min` : ""} left`;
  return `${m} min left`;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const TILES = [
  { to: "record", icon: Mic, title: "Record a Memory", color: "bg-sky-600", testid: "tile-record" },
  { to: "assistant", icon: MessageCircleHeart, title: "Ask My Assistant", color: "bg-emerald-600", testid: "tile-assistant" },
  { to: "today", icon: Sun, title: "Today's Summary", color: "bg-amber-500", testid: "tile-today" },
  { to: "reminders", icon: Bell, title: "My Reminders", color: "bg-violet-600", testid: "tile-reminders" },
  { to: "people", icon: Users, title: "Important People", color: "bg-rose-500", testid: "tile-people" },
  { to: "memory-book", icon: BookHeart, title: "My Memory Book", color: "bg-fuchsia-600", testid: "tile-memory-book" },
];

export default function PatientHome() {
  const { user } = useAuth();
  const now = useClock();
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.full_name?.split(" ")[0] || "there";
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="mm-fade-up" data-testid="patient-home">
      <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-sky-700 text-white p-7 shadow-md">
        <p className="text-sky-100 text-lg">{dateStr} · {timeStr}</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold mt-1">{greet}, {firstName}</h1>
        <p className="mt-4 text-sky-50 text-lg leading-relaxed">
          You are safe. Your reminders and memories are here. 💙
        </p>
      </div>

      <div className="mt-6">
        <NotificationPermissionPrompt settingsPath="/patient/notifications" />
      </div>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} data-testid={t.testid}
            className="group flex items-center gap-5 bg-white border-2 border-stone-200 rounded-3xl p-6 min-h-[100px] shadow-sm hover:border-sky-500 hover:shadow-md active:scale-[0.98] transition-all">
            <span className={`grid place-items-center w-16 h-16 rounded-2xl ${t.color} text-white shrink-0`}>
              <t.icon className="w-9 h-9" strokeWidth={2} />
            </span>
            <span className="font-heading text-xl sm:text-2xl font-semibold">{t.title}</span>
          </Link>
        ))}

        <Link to="emergency" data-testid="tile-emergency"
          className="group flex items-center gap-5 bg-red-50 border-2 border-red-300 rounded-3xl p-6 min-h-[100px] shadow-sm hover:border-red-500 hover:bg-red-100 active:scale-[0.98] transition-all">
          <span className="grid place-items-center w-16 h-16 rounded-2xl bg-red-600 text-white shrink-0 animate-pulse">
            <Phone className="w-9 h-9" strokeWidth={2} />
          </span>
          <span className="font-heading text-xl sm:text-2xl font-bold text-red-700">Emergency Contact</span>
        </Link>
      </div>

      <CaptureSection />
    </div>
  );
}

function CaptureSection() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(() => {
    api.get("/capture/status")
      .then(({ data }) => setStatus(data))
      .catch((e) => logError("Failed to load capture status", e));
  }, []);

  useEffect(() => {
    api.get("/capture/settings")
      .then(({ data }) => setSettings(data))
      .catch((e) => { logError("Failed to load capture settings", e); setSettings({ private_mode: false }); });
    loadStatus();
  }, [loadStatus]);

  // Live countdown so the remaining time ticks down without refetching.
  useEffect(() => {
    if (!status?.always_on || status?.seconds_remaining == null) return undefined;
    const t = setInterval(() => {
      setStatus((s) => (s?.seconds_remaining > 0 ? { ...s, seconds_remaining: s.seconds_remaining - 1 } : s));
    }, 1000);
    return () => clearInterval(t);
  }, [status?.always_on, status?.seconds_remaining]);

  const togglePrivate = async (v) => {
    setSettings((s) => ({ ...s, private_mode: v }));
    try {
      await api.patch("/capture/settings", { private_mode: v });
    } catch (e) {
      logError("Failed to update Private Mode", e);
      toast.error("Couldn't update Private Mode. Please try again.");
      setSettings((s) => ({ ...s, private_mode: !v }));
    }
  };

  const pause = async (paused) => {
    setBusy(true);
    try { const { data } = await api.post("/capture/always-on/pause", { paused }); setStatus(data); }
    catch { toast.error("Could not update capture"); } finally { setBusy(false); }
  };
  const stop = async () => {
    setBusy(true);
    try { const { data } = await api.post("/capture/always-on/stop"); setStatus(data); toast.success("Memory Capture stopped"); }
    catch { toast.error("Could not stop capture"); } finally { setBusy(false); }
  };
  const deleteRecent = async () => {
    if (!window.confirm("Delete memories captured in the last 30 minutes? This cannot be undone.")) return;
    setBusy(true);
    try {
      const { data } = await api.delete("/capture/recent?minutes=30");
      toast.success(`Deleted ${data.deleted_events} recent memor${data.deleted_events === 1 ? "y" : "ies"}.`);
      loadStatus();
    } catch { toast.error("Could not delete recent capture"); } finally { setBusy(false); }
  };

  const on = status?.always_on;
  const paused = status?.paused;
  const remaining = humanRemaining(status?.seconds_remaining);

  return (
    <div className="mt-7" data-testid="capture-section">
      <h2 className="font-heading text-xl font-semibold mb-3">Memory Capture</h2>

      {settings?.private_mode && (
        <div className="mb-4 rounded-2xl bg-stone-900 text-white p-4 flex items-center gap-3" data-testid="private-mode-banner">
          <EyeOff className="w-6 h-6" />
          <p className="font-semibold">Private Mode is ON — nothing is being recorded or saved.</p>
        </div>
      )}

      {/* Always-On status card */}
      {on ? (
        <div className="mb-5 rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-6" data-testid="always-on-status-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`grid place-items-center w-4 h-4 rounded-full ${paused ? "bg-amber-400" : "bg-emerald-500 animate-pulse"}`} />
              <span className="font-heading text-xl font-bold text-emerald-900">
                {paused ? "Memory Capture is PAUSED" : "Memory Capture is ON"}
              </span>
            </div>
            <InfinityIcon className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="mt-2 text-emerald-900/80 text-sm flex flex-wrap gap-x-5 gap-y-1">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {DURATION_LABEL[status.duration] || status.duration}</span>
            {remaining && <span>{remaining}</span>}
          </div>
          {status.last_captured && (
            <p className="mt-3 text-sm text-stone-700 bg-white/70 rounded-xl px-3 py-2" data-testid="last-captured">
              <span className="font-medium">Last memory:</span> {status.last_captured.title}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {paused ? (
              <Button size="sm" disabled={busy} onClick={() => pause(false)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="home-resume-btn"><Play className="w-4 h-4 mr-1" /> Resume</Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => pause(true)} className="rounded-xl bg-amber-500 hover:bg-amber-600" data-testid="home-pause-btn"><Pause className="w-4 h-4 mr-1" /> Pause</Button>
            )}
            <Button size="sm" disabled={busy} onClick={stop} className="rounded-xl bg-red-600 hover:bg-red-700" data-testid="home-stop-btn"><Square className="w-4 h-4 mr-1" /> Stop</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={deleteRecent} className="rounded-xl" data-testid="home-delete-recent-btn"><Trash2 className="w-4 h-4 mr-1" /> Delete recent</Button>
            <Button size="sm" variant="outline" onClick={() => navigate("capture/review")} className="rounded-xl" data-testid="home-review-btn"><ClipboardList className="w-4 h-4 mr-1" /> Review{status.review_count ? ` (${status.review_count})` : ""}</Button>
            <Button size="sm" variant="outline" onClick={() => navigate("capture/always-on")} className="rounded-xl" data-testid="home-change-duration-btn">Change duration</Button>
          </div>
        </div>
      ) : (
        <Link to="capture/always-on" data-testid="tile-always-on"
          className="mb-5 flex items-center gap-5 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-3xl p-6 min-h-[96px] shadow-sm hover:shadow-md active:scale-[0.98] transition-all">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white/15 shrink-0"><InfinityIcon className="w-8 h-8" /></span>
          <span>
            <span className="font-heading text-xl font-semibold block">Turn on Always-On Capture</span>
            <span className="text-emerald-50 text-sm">Listens in the background and saves useful memories. Pause anytime.</span>
          </span>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Link to="capture" data-testid="tile-capture"
          className="flex items-center gap-5 bg-white border-2 border-stone-200 rounded-3xl p-6 min-h-[96px] shadow-sm hover:border-sky-500 hover:shadow-md active:scale-[0.98] transition-all">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-sky-600 text-white shrink-0"><Radio className="w-8 h-8" /></span>
          <span className="font-heading text-xl font-semibold">Start Memory Capture</span>
        </Link>
        <Link to="meeting" data-testid="tile-meeting"
          className="flex items-center gap-5 bg-white border-2 border-stone-200 rounded-3xl p-6 min-h-[96px] shadow-sm hover:border-violet-500 hover:shadow-md active:scale-[0.98] transition-all">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-violet-600 text-white shrink-0"><Video className="w-8 h-8" /></span>
          <span className="font-heading text-xl font-semibold">Meeting Mode</span>
        </Link>
      </div>

      <div className="mt-4 rounded-3xl bg-white border-2 border-stone-200 p-5 flex items-center justify-between" data-testid="private-mode-toggle-row">
        <span className="flex items-center gap-3 text-lg font-medium"><EyeOff className="w-6 h-6 text-stone-500" /> Private Mode</span>
        <Switch checked={!!settings?.private_mode} onCheckedChange={togglePrivate} data-testid="home-private-mode-toggle" />
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link to="capture/review" className="text-sky-700 font-medium" data-testid="link-privacy-review">Privacy review</Link>
        <Link to="capture/vault" className="text-sky-700 font-medium" data-testid="link-private-vault">Private Vault</Link>
        <Link to="share" className="text-sky-700 font-medium" data-testid="link-share">Share &amp; export</Link>
        <Link to="capture/settings" className="text-sky-700 font-medium" data-testid="link-capture-settings">Capture settings</Link>
        <Link to="/how-it-works" className="text-sky-700 font-medium" data-testid="link-how-it-works">How it works</Link>
      </div>
    </div>
  );
}
