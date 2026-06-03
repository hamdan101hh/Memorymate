import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { logError } from "../../lib/logger";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { Phone, MessageSquare, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Emergency() {
  const [patient, setPatient] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setPatient(null);
    api.get("/patient")
      .then(({ data }) => setPatient(data))
      .catch((e) => {
        // Emergency must never fail silently — surface the problem and still show guidance.
        logError("Failed to load emergency contact", e);
        setError(true);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const raise = () => {
    // Best-effort in-app notification. If it fails we log it and tell the user clearly,
    // but the call itself (tel: link) is never blocked by this.
    api.post("/alerts", {
      alert_type: "emergency_button",
      message: "Emergency contact screen was opened by the patient.",
      priority: "high",
    })
      .then(() => toast.success("Your caregiver has been notified in the app."))
      .catch((e) => {
        logError("Failed to send in-app alert", e);
        toast.error("We couldn't notify your caregiver automatically. Please use the number below.");
      });
  };

  // Fallback screen — even if loading fails, the patient still gets emergency guidance.
  if (error) {
    return (
      <div className="mm-fade-up" data-testid="emergency-page">
        <PatientPageHeader title="Emergency Contact" />
        <div className="rounded-3xl bg-red-50 border-2 border-red-200 p-7 text-center">
          <span className="grid place-items-center w-20 h-20 rounded-full bg-red-600 text-white mx-auto shadow-md">
            <ShieldAlert className="w-10 h-10" />
          </span>
          <h2 className="mt-5 font-heading text-2xl font-bold">If you feel unsafe, get help now</h2>
          <p className="text-lg text-stone-600 mt-2">Call your local emergency services, or your trusted contact.</p>
          <Button onClick={load} variant="outline" className="mt-6 h-12 rounded-2xl border-red-200" data-testid="emergency-retry-btn">
            <RefreshCw className="w-5 h-5 mr-2" /> Try again
          </Button>
        </div>
      </div>
    );
  }

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
