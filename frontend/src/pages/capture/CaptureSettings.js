import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Disclaimer } from "../../components/common";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { EyeOff, BatteryCharging, Timer, BatteryWarning, Wifi, Cpu, Save, Sparkles, ArrowLeft, Loader2, Infinity as InfinityIcon, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function CaptureSettings() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const [s, setS] = useState(null);

  const load = useCallback(() => api.get("/capture/settings").then(({ data }) => setS(data)), []);
  useEffect(() => { load(); }, [load]);

  const update = async (patch) => {
    setS((cur) => ({ ...cur, ...patch }));
    try { await api.patch("/capture/settings", patch); } catch { toast.error("Could not save setting"); load(); }
  };

  if (!s) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up max-w-2xl" data-testid="capture-settings-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Memory Capture Settings</h1>

      <div className={`rounded-2xl border-2 p-5 mb-5 ${s.private_mode ? "border-stone-800 bg-stone-900 text-white" : "border-stone-200 bg-white"}`} data-testid="private-mode-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`grid place-items-center w-11 h-11 rounded-xl ${s.private_mode ? "bg-white/15" : "bg-stone-100 text-stone-600"}`}><EyeOff className="w-5 h-5" /></span>
            <div>
              <p className="font-semibold">Private Mode {s.private_mode && "is ON"}</p>
              <p className={`text-sm ${s.private_mode ? "text-stone-300" : "text-stone-500"}`}>No audio, summaries, transcripts or memory events are processed.</p>
            </div>
          </div>
          <Switch checked={s.private_mode} onCheckedChange={(v) => update({ private_mode: v })} data-testid="settings-private-mode-toggle" />
        </div>
      </div>

      <Card title="Battery & performance">
        <Row icon={BatteryCharging} label="Capture only when charging">
          <Switch checked={s.capture_only_when_charging} onCheckedChange={(v) => update({ capture_only_when_charging: v })} data-testid="setting-charging" />
        </Row>
        <Row icon={Timer} label="Auto-stop after">
          <Select value={String(s.auto_stop_minutes)} onValueChange={(v) => update({ auto_stop_minutes: Number(v) })}>
            <SelectTrigger className="w-32 rounded-xl" data-testid="setting-autostop"><SelectValue /></SelectTrigger>
            <SelectContent>{[15, 30, 45, 60, 90].map((m) => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}</SelectContent>
          </Select>
        </Row>
        <Row icon={BatteryWarning} label="Low battery auto-stop">
          <Switch checked={s.low_battery_auto_stop} onCheckedChange={(v) => update({ low_battery_auto_stop: v })} data-testid="setting-lowbattery" />
        </Row>
        <Row icon={Wifi} label="Wi-Fi only processing">
          <Switch checked={s.wifi_only} onCheckedChange={(v) => update({ wifi_only: v })} data-testid="setting-wifi" />
        </Row>
        <Row icon={Cpu} label="Local processing (placeholder)">
          <Switch checked={s.local_processing} onCheckedChange={(v) => update({ local_processing: v })} data-testid="setting-local" />
        </Row>
      </Card>

      <Card title="Default storage">
        <Row icon={Save} label="What to save by default">
          <Select value={s.default_transcript_storage_mode} onValueChange={(v) => update({ default_transcript_storage_mode: v })}>
            <SelectTrigger className="w-48 rounded-xl" data-testid="setting-storage"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="summary_only">Summary only</SelectItem>
              <SelectItem value="transcript">Transcript</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Card>

      <Card title="Location">
        <Row icon={MapPin} label="Allow attaching location to memories">
          <Switch checked={!!s.location_enabled} onCheckedChange={(v) => update({ location_enabled: v })} data-testid="setting-location" />
        </Row>
        <p className="text-xs text-stone-400 pt-2">When on, you can choose to attach your location to a memory. It is never attached automatically.</p>
      </Card>

      <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-5 mb-5" data-testid="always-on-note">
        <div className="flex items-center gap-2 font-semibold text-sky-800"><InfinityIcon className="w-5 h-5" /> Always-On (Continuous) Capture is available</div>
        <p className="text-sm text-stone-600 mt-1">Inside a capture session, turn on “Continuous (always-on)” to auto-save events while you speak, using free on-device dictation. A visible indicator stays on the whole time, and you can pause or stop anytime.</p>
      </div>

      <div className="rounded-xl bg-white border border-stone-200 p-5">
        <div className="flex items-center gap-2 font-semibold mb-2"><Sparkles className="w-5 h-5 text-emerald-600" /> Privacy & safety</div>
        <p className="text-sm text-stone-600 mb-2">Only use Memory Capture where you have permission. Always inform people nearby. A visible indicator and pause/stop controls are shown during every session.</p>
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
function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="flex items-center gap-3 text-stone-700"><Icon className="w-5 h-5 text-stone-400" /> {label}</span>
      {children}
    </div>
  );
}
