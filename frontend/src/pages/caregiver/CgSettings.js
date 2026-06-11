import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { Disclaimer, LEGAL_LINKS } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import PurposeSettingsCard from "../../components/PurposeSettingsCard";
import { COST_LINE } from "../../lib/purposeConfig";
import { ShieldCheck, Save, Loader2, ScrollText, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function CgSettings() {
  const { user, refreshUser } = useAuth();
  const [patient, setPatient] = useState(null);
  const [form, setForm] = useState({ full_name: "", age: "", emergency_contact_name: "", emergency_contact_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/patient").then(({ data }) => {
      setPatient(data);
      setForm({
        full_name: data.full_name || "", age: data.age || "",
        emergency_contact_name: data.emergency_contact_name || "",
        emergency_contact_phone: data.emergency_contact_phone || "", notes: data.notes || "",
      });
    });
  }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/patient", { ...form, age: form.age ? Number(form.age) : null });
      toast.success("Details saved");
    } catch { toast.error("Could not save"); } finally { setSaving(false); }
  };

  return (
    <div data-testid="cg-settings-page" className="max-w-2xl">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">Settings</h1>

      <div className="bg-white border border-stone-200 rounded-xl p-6 mb-5">
        <h2 className="font-semibold mb-1">Your account</h2>
        <p className="text-sm text-stone-500">{user?.full_name} · {user?.email}</p>
        <p className="text-xs text-stone-400 mt-2">{COST_LINE}</p>
      </div>

      <PurposeSettingsCard user={user} refreshUser={refreshUser} />

      <div className="bg-white border border-stone-200 rounded-xl p-6 mb-5">
        <h2 className="font-semibold mb-4">Supported person details</h2>
        {!patient ? <Loader2 className="w-5 h-5 animate-spin text-stone-400" /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input value={form.full_name} onChange={set("full_name")} className="mt-1 rounded-xl" data-testid="cg-patient-name" /></div>
              <div><Label>Age</Label><Input type="number" value={form.age} onChange={set("age")} className="mt-1 rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emergency name</Label><Input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} className="mt-1 rounded-xl" /></div>
              <div><Label>Emergency phone</Label><Input value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} className="mt-1 rounded-xl" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={set("notes")} className="mt-1 rounded-xl" /></div>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="cg-save-patient"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </div>
        )}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 mb-5">
        <h2 className="font-semibold mb-2">Legal &amp; Privacy</h2>
        <div className="divide-y divide-stone-100">
          {LEGAL_LINKS.map((l) => (
            <a key={l.to} href={l.to} target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-between py-2.5 text-stone-700 hover:text-stone-900" data-testid={`cg-legal-link-${l.to.slice(1)}`}>
              <span className="flex items-center gap-2"><ScrollText className="w-4 h-4 text-stone-400" /> {l.label}</span>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-2 font-semibold mb-3"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Safety</div>
        <Disclaimer />
      </div>
    </div>
  );
}
