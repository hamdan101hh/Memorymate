import PublicShell, { H2, Bullets } from "./PublicShell";
import { SUPPORT_EMAIL } from "../../components/common";
import { AlertTriangle } from "lucide-react";

export default function MedicalDisclaimer() {
  return (
    <PublicShell
      title="Medical Disclaimer"
      subtitle="Please read this carefully. MemoryMate supports daily life — it is not a medical service."
      updated="Placeholder — pending legal review"
    >
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3 not-prose">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          If there is a medical emergency, contact your local emergency services immediately.
          MemoryMate cannot help in an emergency.
        </p>
      </div>

      <H2>What MemoryMate is not</H2>
      <Bullets items={[
        "MemoryMate is not a medical device.",
        "It does not diagnose dementia, Alzheimer’s, memory loss, or any condition.",
        "It does not treat, prevent, or cure any condition.",
        "It does not replace doctors, nurses, caregivers, or emergency services.",
      ]} />

      <H2>Medication reminders</H2>
      <p>
        Medication reminders are based only on information that you or your caregiver saved and approved.
        They simply repeat that saved information and are not medical advice. Always check medication
        details with a qualified healthcare professional.
      </p>

      <H2>Always consult a professional</H2>
      <p>
        Always speak to a qualified healthcare professional for any medical concerns, diagnosis, or
        treatment decisions. Never disregard professional medical advice because of something you saw
        in MemoryMate.
      </p>

      <H2>Contact</H2>
      <p>
        Questions? Email{" "}
        <a className="text-sky-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </PublicShell>
  );
}
