import { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { BookHeart, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", relationship: "", photo_url: "", story: "", category: "person" };
const CATEGORIES = [
  { v: "person", l: "Person" }, { v: "place", l: "Place" },
  { v: "event", l: "Life memory" }, { v: "fact", l: "Important fact" },
];

export default function CgMemoryBook() {
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/memory-book").then(({ data }) => setEntries(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try { await api.post("/memory-book", form); toast.success("Added to memory book"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const remove = async (e) => { await api.delete(`/memory-book/${e.id}`); load(); };

  if (!entries) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-memorybook-page">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Memory Book</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-mb-btn"><Plus className="w-4 h-4 mr-1" /> Add entry</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add to memory book</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Title / name</Label><Input value={form.title} onChange={set("title")} className="mt-1 rounded-xl" placeholder="Sarah" data-testid="mb-title-input" /></div>
                <div><Label>Relationship</Label><Input value={form.relationship} onChange={set("relationship")} className="mt-1 rounded-xl" placeholder="Daughter" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={set("category")}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Photo URL</Label><Input value={form.photo_url} onChange={set("photo_url")} className="mt-1 rounded-xl" placeholder="optional" /></div>
              </div>
              <div><Label>Story / what to remember</Label><Textarea value={form.story} onChange={set("story")} className="mt-1 rounded-xl" placeholder="Sarah is your daughter. She visits every Sunday and loves gardening with you." /></div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="mb-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-stone-600 mb-6">Curate photos, people, places and stories. The patient can open these anytime to gently remember.</p>

      {entries.length === 0 ? (
        <EmptyState icon={BookHeart} title="The memory book is empty" message="Add family photos, stories and important facts for the patient to revisit." testid="cg-mb-empty" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((e) => (
            <div key={e.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden" data-testid="cg-mb-card">
              {e.photo_url
                ? <img src={e.photo_url} alt={e.title} className="w-full h-40 object-cover" />
                : <div className="w-full h-40 grid place-items-center bg-rose-50 text-rose-300"><BookHeart className="w-10 h-10" /></div>}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{e.title}</p>
                    {e.relationship && <p className="text-xs text-stone-500">{e.relationship}</p>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(e)} className="rounded-lg shrink-0"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
                </div>
                {e.story && <p className="text-sm text-stone-600 mt-2">{e.story}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
