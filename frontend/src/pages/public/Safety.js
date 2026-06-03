import PublicShell, { H2 } from "./PublicShell";
import { ShieldCheck } from "lucide-react";

export default function Safety() {
  return (
    <PublicShell title="Safety Commitment" subtitle="Supportive, not diagnostic. Here is what that means.">
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex gap-3">
        <ShieldCheck className="w-6 h-6 text-amber-600 shrink-0" />
        <p className="text-amber-900 text-sm leading-relaxed">
          MemoryMate helps organize memories, reminders, and caregiver support. It does not diagnose,
          treat, cure, or replace professional medical advice, emergency services, or clinical care.
        </p>
      </div>
      <H2>We will never</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Diagnose dementia or any other condition.</li>
        <li>Claim to detect, cure or treat a medical condition.</li>
        <li>Replace your doctor, pharmacist or emergency services.</li>
        <li>Make promises about handling emergencies.</li>
      </ul>
      <H2>Our assistant follows safe rules</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>It uses calm, simple language and never says “you forgot”.</li>
        <li>It only uses information that has been saved — it never invents memories or medication.</li>
        <li>For medical questions, it gently suggests checking with a doctor or caregiver.</li>
      </ul>
      <H2>In an emergency</H2>
      <p>
        If you or someone you care for feels unsafe, call your emergency contact or your local
        emergency services right away. MemoryMate does not handle emergencies itself.
      </p>
    </PublicShell>
  );
}
