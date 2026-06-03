import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Pick } from "./CgReminders";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { MapPin, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["home", "clinic", "hospital", "pharmacy", "mosque", "grocery", "family", "custom"];
const empty = { name: "", type: "custom", address: "", description: "", instructions: "", notes: "" };

export default function CgPlaces() {
  const [places, setPlaces] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/places").then(({ data }) => setPlaces(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const add = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try { await api.post("/places", form); toast.success("Place added"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const remove = async (p) => { await api.delete(`/places/${p.id}`); load(); };

  if (!places) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-places-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Important Places</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-place-btn"><Plus className="w-4 h-4 mr-1" /> Add place</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add place</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={set("name")} className="mt-1 rounded-xl" data-testid="place-name-input" /></div>
                <Pick label="Type" value={form.type} onChange={set("type")} options={TYPES} />
              </div>
              <div><Label>Address</Label><Input value={form.address} onChange={set("address")} className="mt-1 rounded-xl" /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={set("description")} className="mt-1 rounded-xl" placeholder="This is where you go for appointments." /></div>
              <div><Label>Instructions</Label><Textarea value={form.instructions} onChange={set("instructions")} className="mt-1 rounded-xl" /></div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="place-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {places.length === 0 ? (
        <EmptyState icon={MapPin} title="No places added yet" message="Add familiar places like home, the clinic or the pharmacy." testid="cg-places-empty" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {places.map((p) => (
            <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="cg-place-card">
              <div className="flex items-start justify-between">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-amber-100 text-amber-700"><MapPin className="w-5 h-5" /></span>
                <Button size="icon" variant="ghost" onClick={() => remove(p)} className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
              </div>
              <h3 className="font-semibold mt-3">{p.name}</h3>
              <p className="text-xs text-stone-400 capitalize">{p.type}</p>
              {p.description && <p className="text-sm text-stone-600 mt-2">{p.description}</p>}
              {p.instructions && <p className="text-xs text-stone-500 mt-1">{p.instructions}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
