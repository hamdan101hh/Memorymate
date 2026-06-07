import PublicShell, { H2, Bullets } from "./PublicShell";
import { SUPPORT_EMAIL } from "../../components/common";

export default function Privacy() {
  return (
    <PublicShell
      title="Privacy Policy"
      subtitle="Your memories and care details are personal. This explains what MemoryMate may collect, why, and the control you have."
      updated="Placeholder — pending legal review"
    >
      <p>
        MemoryMate is a daily-life memory support and caregiver coordination tool. We aim to collect
        as little as possible, keep it private, and give you clear control. This policy uses plain
        language so patients, caregivers, and families can understand it.
      </p>

      <H2>What data MemoryMate may collect</H2>
      <Bullets items={[
        "Account details (name, email, role, password — stored securely).",
        "Patient profile details (name, age, emergency contacts, notes).",
        "Caregiver details and your relationship to the patient.",
        "Family Circle details (invited members and their permissions).",
        "Voice inputs you choose to record.",
        "Transcripts, only if you turn them on (off by default where possible).",
        "Memory summaries created from your inputs.",
        "Reminders you or your caregivers create.",
        "Medication notes (added by you or a caregiver).",
        "Appointments.",
        "People and places you save.",
        "Photos and stories in the Memory Book.",
        "Calendar data, only if you connect a calendar.",
        "WhatsApp / SMS / email delivery information, only if you connect those.",
        "Device and usage data (to keep the service reliable and secure).",
      ]} />

      <H2>Why we collect it</H2>
      <Bullets items={[
        "To create memory summaries from what you record or type.",
        "To create and deliver reminders.",
        "To help caregivers support the patient.",
        "To power the assistant that answers from your saved information.",
        "To provide notifications and exports.",
        "To improve safety, security, and reliability of the service.",
      ]} />
      <p className="text-sm text-stone-500">We do not sell your personal data.</p>

      <H2>Audio and transcripts</H2>
      <p>
        <strong>Raw audio is not stored by default.</strong> When you use Memory Capture, audio is
        processed to create a useful summary and is then discarded unless you explicitly choose to
        save it. <strong>Transcripts are optional and off by default</strong> where possible — you
        choose “summary only” or to also keep a transcript.
      </p>

      <H2>Privacy Review for sensitive items</H2>
      <p>
        Sensitive or uncertain items are not saved automatically. They go to <strong>Privacy
        Review</strong>, where you (or a permitted caregiver) can approve, edit, mark as private,
        delete, or move them to the PIN-protected Private Vault.
      </p>

      <H2>Caregiver access and Family Circle</H2>
      <Bullets items={[
        "Patients see their own information.",
        "Caregivers only see the patient they are connected to.",
        "Family Circle members have permission levels (for example, view-only or full) set when they are invited.",
        "Administrators see system-level information needed to keep the service running.",
      ]} />

      <H2>Your rights and control</H2>
      <Bullets items={[
        "View your data.",
        "Correct your data.",
        "Delete your data.",
        "Export your data.",
        "Remove caregiver or Family Circle access.",
        "Withdraw capture consent at any time.",
      ]} />
      <p>
        You can use the in-app controls, or submit a request on the{" "}
        <a className="text-sky-700 underline" href="/data-deletion">Data Deletion &amp; Requests</a>{" "}
        page.
      </p>

      <H2>Third-party services we may use</H2>
      <p>To run MemoryMate we may rely on trusted providers, including:</p>
      <Bullets items={[
        "AI providers (to create summaries and power the assistant).",
        "Hosting and database providers.",
        "Notification providers (push, and optionally WhatsApp / SMS / email).",
        "Calendar providers, if you connect a calendar.",
        "WhatsApp / SMS / email providers, if you connect them.",
      ]} />
      <p className="text-sm text-stone-500">
        These providers process data on our behalf under their own terms. A final list of sub-processors
        will be published before public launch.
      </p>

      <H2>Data retention and security</H2>
      <p>
        We keep information for as long as your account is active or as needed to provide the service,
        then delete or anonymize it on request. We use reasonable technical and organizational measures
        to protect your data; no online service can promise perfect security.
      </p>

      <H2>Children</H2>
      <p>MemoryMate is intended for adults and their caregivers, not for use by children.</p>

      <H2>Contact</H2>
      <p>
        Questions about privacy? Email{" "}
        <a className="text-sky-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </PublicShell>
  );
}
