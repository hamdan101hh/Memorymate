import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getPatientHomeCopy } from "../../lib/purposeConfig";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import NotificationPermissionPrompt from "../../components/NotificationPermissionPrompt";
import SmartMemoryCaptureCard from "../../components/patient/SmartMemoryCaptureCard";
import MemoryVisualTile from "../../components/MemoryVisualTile";
import { Mic, MessageCircleHeart, Sun, Bell, Users, Phone, BookHeart } from "lucide-react";

const TILES = [
  { to: "record", icon: Mic, title: "Record a memory", color: "bg-sky-600", testid: "tile-record" },
  { to: "assistant", icon: MessageCircleHeart, title: "Ask my assistant", color: "bg-emerald-600", testid: "tile-assistant" },
  { to: "today", icon: Sun, title: "What's happening today?", color: "bg-amber-500", testid: "tile-today" },
  { to: "reminders", icon: Bell, title: "My reminders", color: "bg-violet-600", testid: "tile-reminders" },
  { to: "people", icon: Users, title: "Important people", color: "bg-rose-500", testid: "tile-people" },
  { to: "memory-book", icon: BookHeart, title: "My memory book", color: "bg-fuchsia-600", testid: "tile-memory-book" },
];

export default function PatientHome() {
  const { user } = useAuth();
  const homeCopy = getPatientHomeCopy(user?.memorymate_purpose);
  const now = new Date();
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
          {homeCopy.tagline} MemoryMate helps organize daily life — it is not emergency support.
        </p>
      </div>

      <TodayAtAGlance />

      <SmartMemoryCaptureCard />

      <div className="mt-6">
        <NotificationPermissionPrompt settingsPath="/patient/notifications" />
      </div>

      <RecentMemories />

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
          <span className="font-heading text-xl sm:text-2xl font-bold text-red-700">Call for help</span>
        </Link>
      </div>
    </div>
  );
}

function TodayAtAGlance() {
  const [data, setData] = useState({ reminders: [], appt: null, people: [] });
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      api.get("/reminders"),
      api.get("/appointments"),
      api.get("/people"),
    ]).then(([rem, ap, pe]) => {
      const reminders = (rem.data || []).filter((r) => r.due_date === today && r.status === "pending").slice(0, 3);
      const appts = (ap.data || []).filter((a) => a.date && a.date >= today && a.status !== "completed");
      const next = appts.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
      setData({ reminders, appt: next, people: (pe.data || []).slice(0, 3) });
    }).catch((e) => logError("today glance", e));
  }, []);

  if (!data.reminders.length && !data.appt && !data.people.length) return null;

  return (
    <div className="mt-5 bg-white border border-stone-200 rounded-2xl p-5" data-testid="patient-today-glance">
      <h2 className="font-heading text-lg font-semibold mb-3">Today at a glance</h2>
      <div className="space-y-2 text-sm">
        {data.appt && (
          <p><span className="text-stone-500">Next appointment:</span> <strong>{data.appt.title}</strong> — {data.appt.date} {data.appt.time || ""}</p>
        )}
        {data.reminders.length > 0 && (
          <p><span className="text-stone-500">Reminders today:</span> {data.reminders.map((r) => r.title).join(", ")}</p>
        )}
        {data.people.length > 0 && (
          <p><span className="text-stone-500">Important people:</span> {data.people.map((p) => p.name).join(", ")}</p>
        )}
      </div>
    </div>
  );
}

function RecentMemories() {
  const [memories, setMemories] = useState([]);
  useEffect(() => {
    api.get("/memories").then(({ data }) => setMemories((data || []).slice(0, 3))).catch(() => setMemories([]));
  }, []);

  if (!memories.length) return null;

  return (
    <div className="mt-6" data-testid="patient-recent-memories">
      <h2 className="font-heading text-lg font-semibold mb-3">Recent memories</h2>
      <div className="space-y-3">
        {memories.map((m) => (
          <Link key={m.id} to="/patient/today" className="flex gap-3 bg-white border border-stone-200 rounded-2xl p-3 hover:border-sky-300 transition-colors" data-testid="recent-memory-card">
            <MemoryVisualTile memory={m} compact />
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 truncate">{m.title}</p>
              <p className="text-sm text-stone-600 line-clamp-2">{m.simple_summary}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
