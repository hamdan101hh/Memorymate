import PublicShell, { H2 } from "./PublicShell";

export default function About() {
  return (
    <PublicShell
      title="About MemoryMate"
      subtitle="A calm, supportive companion for memory and family caregiving."
    >
      <p>
        MemoryMate is built for people living with early memory loss and the families who love and
        care for them. It brings memories, reminders, medication schedules, appointments, important
        people and places together in one gentle, easy-to-use place.
      </p>
      <H2>What we believe</H2>
      <p>
        Caring for someone should feel less overwhelming. By organizing the small, important details
        of each day, MemoryMate helps a person feel safe and reassured, while keeping their family
        informed and connected.
      </p>
      <H2>How it helps</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>The person can record or type a memory, and AI turns it into a simple summary.</li>
        <li>Reminders, people, places, medication and appointments are organized automatically.</li>
        <li>Caregivers get a clean dashboard to add reminders, notes and care details.</li>
        <li>A gentle assistant answers simple questions using only what has been saved.</li>
      </ul>
      <H2>What MemoryMate is not</H2>
      <p>
        MemoryMate is a support and organization tool. It does not diagnose, treat, cure, or replace
        professional medical advice, emergency services, or clinical care. Always consult a doctor for
        medical concerns.
      </p>
    </PublicShell>
  );
}
