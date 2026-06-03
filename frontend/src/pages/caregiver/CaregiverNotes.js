import { useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { StickyNote, Send, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function CaregiverNotes() {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/notes").then(({ data }) => setNotes(data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try { await api.post("/notes", { note_text: text, visible_to_patient: visible }); setText(""); toast.success("Note shared"); load(); }
    catch { toast.error("Could not add note"); } finally { setSaving(false); }
  };
  const remove = async (n) => { await api.delete(`/notes/${n.id}`); load(); };

  if (!notes) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="caregiver-notes-page">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Caregiver Notes</h1>

      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note for the patient, e.g. “Dad, I will visit you at 5 PM today.”" className="rounded-xl min-h-[90px]" data-testid="note-input" />
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <Switch checked={visible} onCheckedChange={setVisible} data-testid="note-visible-toggle" />
            {visible ? <><Eye className="w-4 h-4" /> Visible to patient</> : <><EyeOff className="w-4 h-4" /> Private note</>}
          </label>
          <Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="note-save-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Share note</>}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" message="Leave a friendly note for the patient to see on their dashboard." testid="notes-empty" />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-start gap-3" data-testid="note-card">
              <StickyNote className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-stone-700">{n.note_text}</p>
                <p className="text-xs text-stone-400 mt-1">{new Date(n.created_at).toLocaleString()} · {n.visible_to_patient ? "Visible to patient" : "Private"}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(n)} className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
