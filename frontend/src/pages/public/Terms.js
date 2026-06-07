import PublicShell, { H2, Bullets } from "./PublicShell";
import { SUPPORT_EMAIL } from "../../components/common";

export default function Terms() {
  return (
    <PublicShell
      title="Terms of Service"
      subtitle="The basics of using MemoryMate. Please read these before you use the app."
      updated="Placeholder — pending legal review"
    >
      <p>
        By creating an account or using MemoryMate, you agree to these terms. MemoryMate is a daily-life
        memory support and caregiver coordination tool.
      </p>

      <H2>Who can use MemoryMate</H2>
      <Bullets items={[
        "You must be an adult (or a caregiver acting for someone) able to enter an agreement.",
        "Accounts are for patients, caregivers, and invited Family Circle members.",
        "You are responsible for keeping your login secure.",
      ]} />

      <H2>Using the app legally and with consent</H2>
      <Bullets items={[
        "You must use MemoryMate legally and follow the laws that apply to you.",
        "You must obtain proper consent from people before capturing conversations.",
        "You should inform people nearby when Memory Capture is on.",
      ]} />

      <H2>Not a medical or emergency service</H2>
      <Bullets items={[
        "MemoryMate is not a medical diagnosis or treatment tool.",
        "MemoryMate is not an emergency service. In an emergency, contact local emergency services.",
        "Always speak to a qualified healthcare professional for medical concerns.",
      ]} />

      <H2>AI, reminders, and accuracy</H2>
      <Bullets items={[
        "AI can make mistakes. Summaries and suggestions may be incomplete or incorrect.",
        "Users and caregivers must verify important reminders and information.",
        "Medication reminders only repeat information you or your caregiver saved and approved — they are not medical advice.",
        "We do not guarantee that reminders, notifications, or summaries will always be correct or delivered.",
      ]} />

      <H2>Acceptable use</H2>
      <p>
        Do not use MemoryMate to harm, harass, deceive, or unlawfully record others, or to break any law.
        We may suspend or terminate accounts for misuse.
      </p>

      <H2>Payments and subscriptions</H2>
      <p className="text-sm text-stone-500">
        [Placeholder] If paid plans are offered, pricing, billing cycles, renewals, refunds, and
        cancellation terms will appear here before launch.
      </p>

      <H2>Limitation of liability</H2>
      <p className="text-sm text-stone-500">
        [Placeholder] To the maximum extent permitted by law, MemoryMate is provided “as is” without
        warranties, and our liability is limited. Final limitation-of-liability and indemnity language
        will be added after legal review.
      </p>

      <H2>Changes to these terms</H2>
      <p>We may update these terms and will note the date of the latest version.</p>

      <H2>Contact</H2>
      <p>
        Questions? Email{" "}
        <a className="text-sky-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </PublicShell>
  );
}
