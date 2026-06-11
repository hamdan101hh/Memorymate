import { useState } from "react";
import api from "../../lib/api";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { StickyNote, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function QuickNoteCard({ onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");

  const clear = () => setText("");

  const saveNote = async () => {
    const note = text.trim();
    if (!note) {
      toast.error("Write something first");
      return;
    }
    setBusy("note");
    try {
      await api.post("/notes", { note_text: note, visible_to_patient: true });
      toast.success("Note saved");
      clear();
      onSaved?.();
    } catch {
      toast.error("Could not save note");
    } finally {
      setBusy("");
    }
  };

  const saveAsMemory = async () => {
    const note = text.trim();
    if (!note) {
      toast.error("Write something first");
      return;
    }
    setBusy("memory");
    try {
      await api.post("/memories", { transcript: note, source: "manual", title: "Quick note" });
      toast.success("Saved as memory");
      clear();
      onSaved?.();
    } catch {
      toast.error("Could not save memory");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 h-full" data-testid="quick-note-card">
      <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
        <StickyNote className="w-4 h-4 text-sky-600" /> Quick note
      </h2>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write something important to remember…"
        className="rounded-xl min-h-[88px] text-sm resize-none mb-3"
        data-testid="quick-note-input"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={saveNote}
          disabled={busy}
          className="rounded-xl bg-sky-600 hover:bg-sky-700"
          data-testid="quick-note-save"
        >
          {busy === "note" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save note"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={saveAsMemory}
          disabled={busy}
          className="rounded-xl"
          data-testid="quick-note-memory"
        >
          {busy === "memory" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
          Save as memory
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} className="rounded-xl" data-testid="quick-note-clear">
          Clear
        </Button>
      </div>
    </div>
  );
}
