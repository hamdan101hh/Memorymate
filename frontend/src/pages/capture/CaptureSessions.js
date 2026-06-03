import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Radio, Video, Plus, ShieldQuestion, ChevronRight, Loader2 } from "lucide-react";

const STATUS_C = {
  active: "bg-red-100 text-red-700", paused: "bg-amber-100 text-amber-700",
  stopped: "bg-stone-100 text-stone-600", completed: "bg-emerald-100 text-emerald-700",
};

export default function CaptureSessions() {
  const [sessions, setSessions] = useState(null);
  const [review, setReview] = useState([]);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    api.get("/capture/sessions").then(({ data }) => setSessions(data));
    api.get("/capture/review").then(({ data }) => setReview(data));
  }, []);

  if (!sessions) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;
  const active = sessions.filter((s) => ["active", "paused", "stopped"].includes(s.status));
  const completed = sessions.filter((s) => s.status === "completed");
  const list = tab === "active" ? active : completed;

  return (
    <div data-testid="capture-sessions-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Memory Capture</h1>
        <div className="flex gap-2">
          <Link to="/caregiver/capture"><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="start-capture-btn"><Radio className="w-4 h-4 mr-1" /> Start capture</Button></Link>
          <Link to="/caregiver/meeting"><Button variant="outline" className="rounded-xl" data-testid="start-meeting-btn"><Video className="w-4 h-4 mr-1" /> Meeting Mode</Button></Link>
        </div>
      </div>

      <Link to="/caregiver/capture/review" className="block mb-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between" data-testid="review-summary-card">
          <span className="flex items-center gap-2 text-amber-900 font-medium"><ShieldQuestion className="w-5 h-5" /> Pending privacy review</span>
          <span className="flex items-center gap-2"><span className="bg-amber-600 text-white rounded-full px-2.5 py-0.5 text-sm">{review.length}</span><ChevronRight className="w-4 h-4 text-amber-700" /></span>
        </div>
      </Link>

      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList className="rounded-xl">
          <TabsTrigger value="active" className="rounded-lg" data-testid="tab-active-sessions">Active sessions</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg" data-testid="tab-meeting-summaries">Summaries</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState icon={Radio} title={tab === "active" ? "No active sessions" : "No summaries yet"}
          message={tab === "active" ? "Start a capture or meeting session to see it here." : "Completed sessions and meeting summaries will appear here."} testid="sessions-empty" />
      ) : (
        <div className="space-y-3">
          {list.map((s) => (
            <Link key={s.id} to={`/caregiver/capture/session/${s.id}`} className="block" data-testid="session-row">
              <div className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4 hover:border-sky-300 transition-colors">
                <span className={`grid place-items-center w-11 h-11 rounded-xl ${s.mode === "meeting" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                  {s.mode === "meeting" ? <Video className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-xs text-stone-500">{new Date(s.created_at).toLocaleString()} · {s.session_type?.replace(/_/g, " ")}</p>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${STATUS_C[s.status]}`}>{s.status}</span>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
