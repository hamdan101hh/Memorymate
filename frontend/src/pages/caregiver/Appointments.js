import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { CalendarClock, Plus, Trash2, MapPin, Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";

const empty = { title: "", doctor_or_clinic: "", date: "", time: "", location: "", notes: "", transport_notes: "", reminder_time: "1 hour before" };

export default function Appointments() {
  const [appts, setAppts] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get("/appointments").then(({ data }) => setAppts(data)), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try { await api.post("/appointments", form); toast.success("Appointment added"); setOpen(false); setForm(empty); load(); }
    catch { toast.error("Could not add"); } finally { setSaving(false); }
  };
  const remove = async (a) => { await api.delete(`/appointments/${a.id}`); load(); };

  if (!appts) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="appointments-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Appointments</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="add-appointment-btn"><Plus className="w-4 h-4 mr-1" /> Add appointment</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Add appointment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={set("title")} className="mt-1 rounded-xl" data-testid="appt-title-input" /></div>
              <div><Label>Doctor / Clinic</Label><Input value={form.doctor_or_clinic} onChange={set("doctor_or_clinic")} className="mt-1 rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={form.date} onChange={set("date")} className="mt-1 rounded-xl" /></div>
                <div><Label>Time</Label><Input type="time" value={form.time} onChange={set("time")} className="mt-1 rounded-xl" /></div>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={set("location")} className="mt-1 rounded-xl" /></div>
              <div><Label>Transport notes</Label><Input value={form.transport_notes} onChange={set("transport_notes")} className="mt-1 rounded-xl" /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={set("notes")} className="mt-1 rounded-xl" /></div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="appt-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {appts.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No appointments yet" message="Add an appointment to keep track of upcoming visits." testid="appointments-empty" />
      ) : (
        <div className="space-y-4">
          {appts.map((a) => (
            <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-5 flex justify-between items-start gap-4" data-testid="appt-card">
              <div className="flex gap-4">
                <span className="grid place-items-center w-12 h-12 rounded-xl bg-sky-100 text-sky-700 shrink-0"><CalendarClock className="w-6 h-6" /></span>
                <div>
                  <h3 className="font-heading font-semibold text-lg">{a.title}</h3>
                  <p className="text-stone-600 text-sm flex items-center gap-1"><Stethoscope className="w-4 h-4" /> {a.doctor_or_clinic || "—"}</p>
                  <p className="text-stone-500 text-sm mt-1">{a.date} at {a.time} {a.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {a.location}</span>}</p>
                  {a.transport_notes && <p className="text-xs text-stone-400 mt-1">Transport: {a.transport_notes}</p>}
                  {a.notes && <p className="text-xs text-stone-400">{a.notes}</p>}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(a)} className="rounded-lg"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
