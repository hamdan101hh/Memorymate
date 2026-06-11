import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Disclaimer, LEGAL_LINKS } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Type, Contrast, Phone, LogOut, ShieldCheck, Loader2, Bell, ChevronRight, ScrollText } from "lucide-react";
import PurposeSettingsCard from "../../components/PurposeSettingsCard";
import { toast } from "sonner";

export default function PatientSettings() {
  const { user, settings, updateSettings, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/patient").then(({ data }) => {
      setPatient(data); setEcName(data.emergency_contact_name || ""); setEcPhone(data.emergency_contact_phone || "");
    });
  }, []);

  const saveEc = async () => {
    setSaving(true);
    try { await api.patch("/patient", { emergency_contact_name: ecName, emergency_contact_phone: ecPhone }); toast.success("Saved"); }
    catch { toast.error("Could not save"); } finally { setSaving(false); }
  };

  return (
    <div className="mm-fade-up" data-testid="patient-settings-page">
      <PatientPageHeader title="Settings" subtitle={user?.full_name} />

      <PurposeSettingsCard user={user} refreshUser={refreshUser} testId="patient-settings-purpose" />

      <Card title="Accessibility">
        <Row icon={Type} label="Large text">
          <Switch checked={settings.largeText} onCheckedChange={(v) => updateSettings({ largeText: v })} data-testid="toggle-large-text" />
        </Row>
        <Row icon={Contrast} label="High contrast">
          <Switch checked={settings.highContrast} onCheckedChange={(v) => updateSettings({ highContrast: v })} data-testid="toggle-high-contrast" />
        </Row>
      </Card>

      <Card title="Notifications">
        <button onClick={() => navigate("/patient/notifications")} className="flex w-full items-center justify-between py-2 text-left" data-testid="settings-notifications-link">
          <span className="flex items-center gap-3 text-lg"><Bell className="w-6 h-6 text-stone-500" /> Reminder notifications</span>
          <ChevronRight className="w-5 h-5 text-stone-400" />
        </button>
        <p className="text-sm text-stone-500">Turn on gentle reminders and choose quiet hours.</p>
      </Card>

      <Card title="Emergency contact">
        {!patient ? <Loader2 className="w-5 h-5 animate-spin text-stone-400" /> : (
          <div className="space-y-3">
            <Input value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Contact name" className="h-12 rounded-xl" data-testid="settings-ec-name" />
            <Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="Contact phone" className="h-12 rounded-xl" data-testid="settings-ec-phone" />
            <Button onClick={saveEc} disabled={saving} className="rounded-xl bg-sky-600 hover:bg-sky-700"><Phone className="w-4 h-4 mr-1" /> Save contact</Button>
          </div>
        )}
      </Card>

      <Card title="Legal & Privacy">
        <div className="space-y-1">
          {LEGAL_LINKS.map((l) => (
            <a key={l.to} href={l.to} target="_blank" rel="noopener noreferrer"
               className="flex items-center justify-between py-2 text-left" data-testid={`legal-link-${l.to.slice(1)}`}>
              <span className="flex items-center gap-3 text-lg"><ScrollText className="w-6 h-6 text-stone-500" /> {l.label}</span>
              <ChevronRight className="w-5 h-5 text-stone-400" />
            </a>
          ))}
        </div>
      </Card>

      <Card title="Safety">
        <div className="flex gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          <Disclaimer />
        </div>
      </Card>

      <Button onClick={() => { logout(); navigate("/"); }} variant="outline" className="mt-6 w-full h-13 py-3 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 text-base" data-testid="settings-logout-btn">
        <LogOut className="w-5 h-5 mr-2" /> Log out
      </Button>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="mb-5 rounded-3xl bg-white border-2 border-stone-200 p-6">
      <h2 className="font-heading text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}
function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="flex items-center gap-3 text-lg"><Icon className="w-6 h-6 text-stone-500" /> {label}</span>
      {children}
    </div>
  );
}
