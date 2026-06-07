import PublicShell, { H2, Bullets } from "./PublicShell";
import { SUPPORT_EMAIL } from "../../components/common";
import { ShieldCheck, Eye, Pause, Trash2, ClipboardList, Minimize2 } from "lucide-react";

const PRINCIPLES = [
  { icon: ShieldCheck, t: "Clear permission", d: "Capture only starts after you give clear permission." },
  { icon: Eye, t: "Visible status", d: "A clear “Memory Capture ON” status is shown while it is active." },
  { icon: Pause, t: "Pause / stop control", d: "You can pause or stop capture at any moment." },
  { icon: Trash2, t: "Delete option", d: "You can delete recently captured items right away." },
  { icon: ClipboardList, t: "Privacy Review", d: "Sensitive or uncertain items wait for your review before saving." },
  { icon: Minimize2, t: "Data minimization", d: "We save useful summaries — not every word." },
];

export default function Consent() {
  return (
    <PublicShell
      title="Consent & Recording Policy"
      subtitle="Smart Background Memory Capture is optional, consent-based, and always under your control."
      updated="Placeholder — pending legal review"
    >
      <p>
        MemoryMate’s Smart Background Memory Capture can turn useful daily moments into reminders and
        summaries. It is designed to respect everyone in the room. This policy explains how it works
        and the promises we make.
      </p>

      <H2>How capture works</H2>
      <Bullets items={[
        "Memory Capture is optional — it is off until you choose to turn it on.",
        "It only starts after clear permission.",
        "A clear capture status is visible whenever it is active.",
        "You can pause, stop, or delete recent capture at any time.",
        "You should inform people nearby when capture is on.",
        "MemoryMate is designed to save useful summaries, not every word.",
        "Raw audio is deleted by default after processing, unless you explicitly choose to save it.",
        "Sensitive or uncertain information goes to Privacy Review before anything is saved.",
        "You can withdraw consent at any time.",
      ]} />

      <H2>Consent principles</H2>
      <div className="grid sm:grid-cols-2 gap-4 not-prose">
        {PRINCIPLES.map((p) => (
          <div key={p.t} className="rounded-2xl border border-stone-200 bg-white p-4 flex gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <p.icon className="w-5 h-5" />
            </span>
            <div>
              <p className="font-semibold text-stone-800">{p.t}</p>
              <p className="text-sm text-stone-600">{p.d}</p>
            </div>
          </div>
        ))}
      </div>

      <H2>Recording others responsibly</H2>
      <p>
        Laws about recording conversations vary by location and may require the consent of everyone
        involved. You are responsible for using capture lawfully and for informing people nearby when
        it is on.
      </p>

      <H2>Withdrawing consent</H2>
      <p>
        You can stop capture and withdraw consent at any time from the home screen or capture settings.
        You can also delete recently captured items and request deletion of stored data on the{" "}
        <a className="text-sky-700 underline" href="/data-deletion">Data Deletion &amp; Requests</a> page.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about capture and consent? Email{" "}
        <a className="text-sky-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </PublicShell>
  );
}
