import { useEffect, useState } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Users, Plus, Trash2, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";

const empty = { name: "", relationship: "", phone: "", photo_url: "", description: "", explanation_for_patient: "", notes: "" };

export default function CgPeople() {
  const [people, setPeople] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/people").then(({ data }) => setPeople(data));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try { await api.post("/people", form); toast.success("Person added"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const remove = async (p) => { await api.delete(`/people/${p.id}`); load(); };

  if (!people) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-people-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Important People</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-person-btn"><Plus className="w-4 h-4 mr-1" /> Add person</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add person</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={set("name")} className="mt-1 rounded-xl" data-testid="person-name-input" /></div>
                <div><Label>Relationship</Label><Input value={form.relationship} onChange={set("relationship")} className="mt-1 rounded-xl" placeholder="Daughter" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={set("phone")} className="mt-1 rounded-xl" /></div>
                <div><Label>Photo URL</Label><Input value={form.photo_url} onChange={set("photo_url")} className="mt-1 rounded-xl" placeholder="optional" /></div>
              </div>
              <div><Label>Description</Label><Input value={form.description} onChange={set("description")} className="mt-1 rounded-xl" /></div>
              <div><Label>How to explain this person to the patient</Label><Textarea value={form.explanation_for_patient} onChange={set("explanation_for_patient")} className="mt-1 rounded-xl" placeholder="Sarah is your daughter. She visits you often." /></div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="person-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {people.length === 0 ? (
        <EmptyState icon={Users} title="No important people added yet" message="Add family members to help the assistant remember them." testid="cg-people-empty" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map((p) => (
            <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="cg-person-card">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-12 h-12 rounded-full bg-rose-100 text-rose-600 font-bold overflow-hidden">
                  {p.photo_url ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" /> : p.name?.[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-stone-500">{p.relationship}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(p)} className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
              </div>
              {p.explanation_for_patient && <p className="text-sm text-stone-600 mt-3">{p.explanation_for_patient}</p>}
              {p.phone && <p className="text-xs text-stone-400 mt-2 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {p.phone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
