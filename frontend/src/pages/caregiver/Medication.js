import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Pick } from "./CgReminders";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Pill, Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const TIMES = ["morning", "afternoon", "evening", "night"];
const empty = { medication_name: "", dosage: "", frequency: "Daily", time_of_day: "morning", instructions: "", start_date: "", end_date: "", notes: "", priority: "medium" };

export default function Medication() {
  const [meds, setMeds] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/medications").then(({ data }) => setMeds(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const add = async () => {
    if (!form.medication_name.trim()) { toast.error("Medication name is required"); return; }
    setSaving(true);
    try { await api.post("/medications", form); toast.success("Medication added"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const remove = async (m) => { await api.delete(`/medications/${m.id}`); load(); };

  if (!meds) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="medication-page">
      <div className="flex items-center justify-between mb-3">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Medication</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-medication-btn"><Plus className="w-4 h-4 mr-1" /> Add medication</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add medication</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Medication name</Label><Input value={form.medication_name} onChange={set("medication_name")} className="mt-1 rounded-xl" data-testid="med-name-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Dosage</Label><Input value={form.dosage} onChange={set("dosage")} className="mt-1 rounded-xl" placeholder="1 tablet" /></div>
                <div><Label>Frequency</Label><Input value={form.frequency} onChange={set("frequency")} className="mt-1 rounded-xl" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Pick label="Time of day" value={form.time_of_day} onChange={set("time_of_day")} options={TIMES} />
                <Pick label="Priority" value={form.priority} onChange={set("priority")} options={["low", "medium", "high"]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={set("start_date")} className="mt-1 rounded-xl" /></div>
                <div><Label>End date</Label><Input type="date" value={form.end_date} onChange={set("end_date")} className="mt-1 rounded-xl" /></div>
              </div>
              <div><Label>Instructions</Label><Textarea value={form.instructions} onChange={set("instructions")} className="mt-1 rounded-xl" /></div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="med-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-6 flex gap-2 text-sm text-amber-900">
        <AlertTriangle className="w-5 h-5 shrink-0" /> Medication information should be confirmed with a doctor or pharmacist.
      </div>

      {meds.length === 0 ? (
        <EmptyState icon={Pill} title="No medications added" message="Add a medication schedule to keep things organized." testid="medication-empty" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {TIMES.map((t) => {
            const items = meds.filter((m) => m.time_of_day === t);
            if (items.length === 0) return null;
            return (
              <div key={t} className="bg-white border border-stone-200 rounded-xl p-5">
                <h3 className="font-heading font-semibold capitalize mb-3 flex items-center gap-2"><Pill className="w-5 h-5 text-emerald-600" /> {t}</h3>
                <div className="space-y-3">
                  {items.map((m) => (
                    <div key={m.id} className="border border-stone-100 rounded-lg p-3 flex justify-between items-start gap-2" data-testid="med-card">
                      <div>
                        <p className="font-medium">{m.medication_name}</p>
                        <p className="text-xs text-stone-500">{m.dosage} · {m.frequency}</p>
                        {m.instructions && <p className="text-xs text-stone-500 mt-1">{m.instructions}</p>}
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(m)} className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
