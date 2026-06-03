import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import { Switch } from "../../components/ui/switch";
import { Mic, MessageCircleHeart, Sun, Bell, Users, Phone, Radio, Video, EyeOff } from "lucide-react";
import { toast } from "sonner";

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
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    api.get("/capture/settings")
      .then(({ data }) => setSettings(data))
      .catch((e) => { logError("Failed to load capture settings", e); setSettings({ private_mode: false }); });
  }, []);

  const togglePrivate = async (v) => {
    setSettings((s) => ({ ...s, private_mode: v }));
    try {
      await api.patch("/capture/settings", { private_mode: v });
    } catch (e) {
      logError("Failed to update Private Mode", e);
      toast.error("Couldn't update Private Mode. Please try again.");
      setSettings((s) => ({ ...s, private_mode: !v })); // revert on failure
    }
  };

  return (
    <div className="mt-7" data-testid="capture-section">
      <h2 className="font-heading text-xl font-semibold mb-3">Memory Capture</h2>

      {settings?.private_mode && (
        <div className="mb-4 rounded-2xl bg-stone-900 text-white p-4 flex items-center gap-3" data-testid="private-mode-banner">
          <EyeOff className="w-6 h-6" />
          <p className="font-semibold">Private Mode is ON — nothing is being recorded or saved.</p>
        </div>
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

      <div className="mt-3 flex gap-4 text-sm">
        <Link to="capture/review" className="text-sky-700 font-medium" data-testid="link-privacy-review">Privacy review</Link>
        <Link to="capture/settings" className="text-sky-700 font-medium" data-testid="link-capture-settings">Capture settings</Link>
      </div>
    </div>
  );
}
