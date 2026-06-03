import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Mic, MessageCircleHeart, Sun, Bell, Users, Phone } from "lucide-react";

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
    </div>
  );
}
