import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { MessageSquare, Plus, Trash2, Loader2, Send, CheckCircle2, AlertTriangle, Sun } from "lucide-react";
import { toast } from "sonner";

const empty = { phone: "", name: "", role: "patient" };

export default function CgWhatsApp() {
  const [links, setLinks] = useState(null);
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/whatsapp/links").then(({ data }) => setLinks(data)).catch(() => setLinks([]));
    api.get("/whatsapp/status").then(({ data }) => setStatus(data)).catch(() => setStatus(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const add = async () => {
    if (!form.phone.trim()) { toast.error("Phone number is required"); return; }
    setSaving(true);
    try { await api.post("/whatsapp/links", form); toast.success("Number linked"); setOpen(false); setForm(empty); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Could not link"); }
    finally { setSaving(false); }
  };
  const remove = async (l) => { await api.delete(`/whatsapp/links/${l.id}`); load(); };

  const sendTest = async (l) => {
    setBusy(true);
    try { await api.post("/whatsapp/send", { phone: l.phone, message: "Hi from MemoryMate \uD83D\uDC99 This is a test message." }); toast.success("Test sent"); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Send failed (is WhatsApp configured & within the 24h window?)"); }
    finally { setBusy(false); }
  };
  const sendSummary = async () => {
    setBusy(true);
    try { const { data } = await api.post("/whatsapp/send-summary"); toast.success(`Summary sent to ${data.sent} number(s)`); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Could not send summary"); }
    finally { setBusy(false); }
  };

  if (!links) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div data-testid="cg-whatsapp-page">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">WhatsApp Bot</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="add-wa-btn"><Plus className="w-4 h-4 mr-1" /> Link number</Button></DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Link a WhatsApp number</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Phone (with country code)</Label><Input value={form.phone} onChange={set("phone")} className="mt-1 rounded-xl" placeholder="+971 50 123 4567" data-testid="wa-phone-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={set("name")} className="mt-1 rounded-xl" placeholder="Omar" /></div>
                <div><Label>Whose number</Label>
                  <Select value={form.role} onValueChange={set("role")}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient">Patient (gets reminders & summaries)</SelectItem>
                      <SelectItem value="family">Family member (can send notes in)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={add} disabled={saving} className="rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="wa-save-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-stone-600 mb-5">Linked numbers can message the bot to save memories automatically, and the patient can receive reminders and daily summaries on WhatsApp.</p>

      <div className={`rounded-xl border p-4 mb-5 flex items-start gap-3 ${status?.configured ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} data-testid="wa-status">
        {status?.configured
          ? <><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /><div><p className="font-medium text-emerald-800">WhatsApp is connected</p><p className="text-sm text-stone-600">Inbound messages save as memories; you can send reminders and summaries.</p></div></>
          : <><AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /><div><p className="font-medium text-amber-800">WhatsApp not configured yet</p><p className="text-sm text-stone-600">You can link numbers now. Sending/receiving starts once the WhatsApp Cloud API keys are set on the server and the app is deployed (see DEPLOY.md).</p></div></>}
      </div>

      {links.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No numbers linked yet" message="Link the patient's WhatsApp number to start." testid="cg-wa-empty" />
      ) : (
        <>
          <div className="flex justify-end mb-3">
            <Button onClick={sendSummary} disabled={busy} variant="outline" className="rounded-xl" data-testid="wa-send-summary"><Sun className="w-4 h-4 mr-1" /> Send today's summary to patient</Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {links.map((l) => (
              <div key={l.id} className="bg-white border border-stone-200 rounded-xl p-5" data-testid="wa-link-card">
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center w-11 h-11 rounded-full bg-emerald-100 text-emerald-700"><MessageSquare className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{l.name || l.phone}</p>
                    <p className="text-xs text-stone-500">+{l.phone} · {l.role === "patient" ? "Patient" : "Family"}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(l)} className="rounded-lg shrink-0"><Trash2 className="w-4 h-4 text-stone-400" /></Button>
                </div>
                <Button onClick={() => sendTest(l)} disabled={busy} size="sm" variant="outline" className="rounded-lg mt-3"><Send className="w-3.5 h-3.5 mr-1" /> Send test</Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
