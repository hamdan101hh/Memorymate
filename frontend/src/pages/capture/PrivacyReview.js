import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { ShieldQuestion, Bell, Sparkles, Lock, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const ACTIONS = [
  { key: "save", label: "Save as memory", icon: Sparkles, c: "bg-sky-600 hover:bg-sky-700" },
  { key: "convert_reminder", label: "Convert to reminder", icon: Bell, c: "bg-violet-600 hover:bg-violet-700" },
  { key: "mark_private", label: "Mark private", icon: Lock, c: "bg-stone-600 hover:bg-stone-700" },
  { key: "delete", label: "Delete", icon: Trash2, c: "bg-red-600 hover:bg-red-700" },
];

export default function PrivacyReview() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => api.get("/capture/review").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const act = async (item, action) => {
    setBusy(item.id);
    try { await api.post(`/capture/review/${item.id}/action`, { action }); toast.success("Updated"); load(); }
    catch { toast.error("Could not update"); } finally { setBusy(null); }
  };

  if (!items) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up max-w-3xl" data-testid="privacy-review-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-1">Privacy Review Queue</h1>
      <p className="text-stone-600 mb-6">When the AI is unsure or content may be sensitive, it waits here for your decision. Nothing is saved as a memory until you approve it.</p>

      {items.length === 0 ? (
        <EmptyState icon={ShieldQuestion} title="Nothing to review" message="When a capture session flags uncertain or sensitive content, it will appear here." testid="review-empty" />
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="review-item-card">
              <div className="flex items-start gap-2">
                <ShieldQuestion className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-stone-800">{it.content}</p>
                  <p className="text-xs text-stone-500 mt-1">Suggested: <span className="capitalize">{it.suggested_type}</span> · {it.reason}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ACTIONS.map((a) => (
                  <Button key={a.key} size="sm" disabled={busy === it.id} onClick={() => act(it, a.key)} className={`rounded-xl text-white ${a.c}`} data-testid={`review-action-${a.key}`}>
                    <a.icon className="w-4 h-4 mr-1" /> {a.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
