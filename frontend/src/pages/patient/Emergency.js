import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Phone, MessageSquare, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Emergency() {
  const [patient, setPatient] = useState(null);

  useEffect(() => { api.get("/patient").then(({ data }) => setPatient(data)); }, []);

  const raise = async () => {
    try {
      await api.post("/alerts", { alert_type: "emergency_button", message: "Emergency contact screen was opened by the patient.", priority: "high" });
      toast.success("Your caregiver has been notified in the app.");
    } catch { /* silent */ }
  };

  if (!patient) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  const name = patient.caregivers?.[0]?.full_name || patient.emergency_contact_name || "Your caregiver";
  const phone = patient.caregivers?.[0]?.phone || patient.emergency_contact_phone || "";

  return (
    <div className="mm-fade-up" data-testid="emergency-page">
      <PatientPageHeader title="Emergency Contact" />

      <div className="rounded-3xl bg-red-50 border-2 border-red-200 p-7 text-center">
        <span className="grid place-items-center w-24 h-24 rounded-full bg-red-600 text-white mx-auto shadow-md">
          <Phone className="w-12 h-12" />
        </span>
        <h2 className="mt-5 font-heading text-3xl font-bold">{name}</h2>
        {phone && <p className="text-xl text-stone-600 mt-1">{phone}</p>}

        <div className="mt-7 flex flex-col gap-3">
          <a href={phone ? `tel:${phone}` : undefined} onClick={raise}>
            <Button className="w-full h-16 rounded-2xl bg-red-600 hover:bg-red-700 text-xl" data-testid="emergency-call-btn">
              <Phone className="w-6 h-6 mr-2" /> Call now
            </Button>
          </a>
          {phone && (
            <a href={`sms:${phone}`}>
              <Button variant="outline" className="w-full h-14 rounded-2xl text-lg border-red-200" data-testid="emergency-message-btn">
                <MessageSquare className="w-5 h-5 mr-2" /> Send a message
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-5 flex gap-3">
        <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
        <p className="text-amber-900 leading-relaxed">
          If you feel unsafe, call your emergency contact or your local emergency services.
          MemoryMate does not handle emergencies itself.
        </p>
      </div>
    </div>
  );
}
