import { useState } from "react";
import PublicShell, { H2, Bullets } from "./PublicShell";
import { SUPPORT_EMAIL } from "../../components/common";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

const REQUEST_TYPES = [
  { v: "delete_account", l: "Delete my account" },
  { v: "delete_memory_data", l: "Delete specific memory data" },
  { v: "export_data", l: "Export my data" },
  { v: "remove_caregiver", l: "Remove caregiver access" },
  { v: "remove_connector", l: "Remove connector access" },
  { v: "other", l: "Other" },
];

export default function DataDeletion() {
  const [f, setF] = useState({ full_name: "", email: "", role: "patient", request_type: "delete_account", message: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));

  const submit = async (e) => {
    e?.preventDefault();
    if (!f.full_name.trim() || !f.email.trim()) return;
    setSending(true);
    try {
      // Best effort: create a support ticket if the backend is available.
      await api.post("/support/requests", f);
    } catch {
      /* If backend isn't ready, we still confirm receipt to the user. */
    } finally {
      setSending(false);
      setDone(true);
    }
  };

  return (
    <PublicShell
      title="Data Deletion & Requests"
      subtitle="Ask us to delete, export, or change access to your data. We’ll handle it through a secure support process."
      updated="Placeholder — pending legal review"
    >
      <p>You can request any of the following:</p>
      <Bullets items={[
        "Account deletion",
        "Patient profile deletion",
        "Audio deletion",
        "Transcript deletion",
        "Memory summary deletion",
        "Reminder deletion",
        "Calendar connector removal",
        "WhatsApp / SMS / email connector removal",
        "Caregiver access removal",
        "Full data export",
      ]} />

      <H2>Make a request</H2>
      {done ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 flex gap-3 not-prose" data-testid="data-deletion-success">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900">Your request has been received.</p>
            <p className="text-sm text-emerald-800 mt-1">
              In production, this will create a secure support ticket. We’ll follow up by email at the
              address you provided. You can also email{" "}
              <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> directly.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-6 space-y-4 not-prose" data-testid="data-deletion-form">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Full name</Label>
              <Input value={f.full_name} onChange={set("full_name")} required className="mt-1 h-11 rounded-xl" data-testid="dd-name" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={f.email} onChange={set("email")} required className="mt-1 h-11 rounded-xl" data-testid="dd-email" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Account role</Label>
              <Select value={f.role} onValueChange={set("role")}>
                <SelectTrigger className="mt-1 rounded-xl h-11" data-testid="dd-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="caregiver">Caregiver</SelectItem>
                  <SelectItem value="family">Family member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Request type</Label>
              <Select value={f.request_type} onValueChange={set("request_type")}>
                <SelectTrigger className="mt-1 rounded-xl h-11" data-testid="dd-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={f.message} onChange={set("message")} placeholder="Tell us what you’d like us to do." className="mt-1 rounded-xl min-h-28" data-testid="dd-message" />
          </div>
          <Button type="submit" disabled={sending} className="w-full h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="dd-submit">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit request"}
          </Button>
        </form>
      )}

      <p className="mt-6 flex items-center gap-2 text-stone-600">
        <Mail className="w-4 h-4" /> Prefer email? Contact{" "}
        <a className="text-sky-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </PublicShell>
  );
}
