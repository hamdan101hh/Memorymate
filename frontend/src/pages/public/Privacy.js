import PublicShell, { H2 } from "./PublicShell";

export default function Privacy() {
  return (
    <PublicShell title="Privacy & Consent" subtitle="Your memories and care details are personal. Here is how we handle them.">
      <H2>Recordings and notes</H2>
      <p>
        When you record or type a memory, the text may be processed by AI to create simple summaries
        and to extract reminders, people, places, medication mentions and appointments. This helps
        organize the information for you and your caregiver.
      </p>
      <H2>Who can see your data</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>You only see your own information.</li>
        <li>Caregivers only see the patient they are connected to.</li>
        <li>Administrators can see system-level information to keep the service running.</li>
      </ul>
      <H2>Your consent</H2>
      <p>
        During onboarding we ask you to confirm that you understand recordings and notes may be
        processed by AI. You can review this at any time in Settings.
      </p>
      <H2>Your control</H2>
      <p>
        You can add or remove memories, reminders, people and places at any time. Care information is
        kept private and is never shared publicly.
      </p>
    </PublicShell>
  );
}
