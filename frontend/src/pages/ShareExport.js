import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { logError } from "../lib/logger";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Textarea } from "../components/ui/textarea";
import { Share2, Copy, FileDown, MessageCircle, Smartphone, Mail, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const SECTIONS = [
  { key: "summary", label: "Today's summary" },
  { key: "reminders", label: "Reminders" },
  { key: "appointments", label: "Appointments" },
  { key: "medications", label: "Medication list" },
];

const PRIVACY = [
  { key: "hideMeds", label: "Hide medication details" },
  { key: "hideLocations", label: "Hide locations" },
  { key: "hideNames", label: "Hide personal names (use initials)" },
];

function initials(name) {
  return String(name || "").trim().split(/\s+/).map((w) => w[0]?.toUpperCase()).join("") || "—";
}

export default function ShareExport() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [sections, setSections] = useState({ summary: true, reminders: true, appointments: true, medications: false });
  const [privacy, setPrivacy] = useState({ hideMeds: false, hideLocations: false, hideNames: false });

  const load = useCallback(async () => {
    try {
      const [summary, meds, appts, people] = await Promise.all([
        api.get("/summary/today").then((r) => r.data).catch(() => null),
        api.get("/medications").then((r) => r.data).catch(() => []),
        api.get("/appointments").then((r) => r.data).catch(() => []),
        api.get("/people").then((r) => r.data).catch(() => []),
      ]);
      setData({ summary, meds, appts, people });
    } catch (e) { logError("Failed to load share data", e); setData({ summary: null, meds: [], appts: [], people: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => {
    if (!data) return "";
    const names = (data.people || []).map((p) => p.name).filter(Boolean);
    const redact = (text) => {
      let out = text || "";
      if (privacy.hideNames) names.forEach((n) => { out = out.split(n).join(initials(n)); });
      return out;
    };
    const lines = [];
    const title = user.role === "patient" ? "My MemoryMate summary" : "MemoryMate caregiver summary";
    lines.push(title);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push("");

    if (sections.summary && data.summary) {
      lines.push("== TODAY ==");
      const tl = data.summary.timeline || {};
      ["morning", "afternoon", "evening"].forEach((bucket) => {
        const items = tl[bucket] || [];
        if (items.length) {
          lines.push(`${bucket[0].toUpperCase()}${bucket.slice(1)}:`);
          items.forEach((m) => lines.push(`  - ${redact(m.simple_summary || m.title || "")}`));
        }
      });
      if (!data.summary.has_data) lines.push("  (No memories recorded yet today.)");
      lines.push("");
    }

    if (sections.reminders && data.summary?.reminders_today?.length) {
      lines.push("== REMINDERS ==");
      data.summary.reminders_today.forEach((r) => lines.push(`  - [${r.status}] ${redact(r.title)}`));
      lines.push("");
    }

    if (sections.appointments && (data.appts || []).length) {
      lines.push("== APPOINTMENTS ==");
      data.appts.forEach((a) => {
        const loc = privacy.hideLocations ? "" : (a.location ? ` @ ${a.location}` : "");
        const when = [a.date, a.time].filter(Boolean).join(" ");
        lines.push(`  - ${redact(a.title)}${when ? ` (${when})` : ""}${loc}`);
      });
      lines.push("");
    }

    if (sections.medications && !privacy.hideMeds && (data.meds || []).length) {
      lines.push("== MEDICATIONS ==");
      data.meds.forEach((m) => {
        const detail = [m.dosage, m.frequency || m.time_of_day].filter(Boolean).join(", ");
        lines.push(`  - ${m.medication_name}${detail ? ` — ${detail}` : ""}`);
      });
      lines.push("  (Always confirm medication with a doctor or pharmacist.)");
      lines.push("");
    }

    lines.push("Shared from MemoryMate — supportive, not a medical record.");
    return lines.join("\n");
  }, [data, sections, privacy, user.role]);

  const toggle = (setter) => (key) => (v) => setter((s) => ({ ...s, [key]: !!v }));

  const copyText = async () => {
    try { await navigator.clipboard.writeText(report); toast.success("Copied to clipboard"); }
    catch { toast.error("Could not copy"); }
  };

  const downloadPdf = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export a PDF."); return; }
    const safe = report.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    w.document.write(
      `<html><head><title>MemoryMate summary</title><meta charset="utf-8"/>` +
      `<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:32px;color:#1c1917;line-height:1.5}` +
      `pre{white-space:pre-wrap;font:inherit;font-size:14px}h1{font-size:20px}</style></head>` +
      `<body><pre>${safe}</pre><script>window.onload=function(){window.print();}</script></body></html>`
    );
    w.document.close();
  };

  const enc = encodeURIComponent(report);
  const shareLinks = [
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc}`, c: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "SMS", icon: Smartphone, href: `sms:?&body=${enc}`, c: "bg-sky-600 hover:bg-sky-700" },
    { label: "Email", icon: Mail, href: `mailto:?subject=${encodeURIComponent("MemoryMate summary")}&body=${enc}`, c: "bg-violet-600 hover:bg-violet-700" },
  ];

  if (!data) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up max-w-3xl" data-testid="share-export-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div className="flex items-center gap-3 mb-1">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-sky-600 text-white"><Share2 className="w-6 h-6" /></span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Share &amp; Export</h1>
      </div>
      <p className="text-stone-600 mb-6">Choose what to include, apply privacy controls, then copy, save as PDF, or share. Private Vault items are never included.</p>

      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <p className="font-semibold mb-3">Include</p>
          <div className="space-y-2.5">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 cursor-pointer text-sm text-stone-700" data-testid={`share-section-${s.key}`}>
                <Checkbox checked={sections[s.key]} onCheckedChange={toggle(setSections)(s.key)} /> {s.label}
              </label>
            ))}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <p className="font-semibold mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Privacy controls</p>
          <div className="space-y-2.5">
            {PRIVACY.map((p) => (
              <label key={p.key} className="flex items-center gap-2 cursor-pointer text-sm text-stone-700" data-testid={`share-privacy-${p.key}`}>
                <Checkbox checked={privacy[p.key]} onCheckedChange={toggle(setPrivacy)(p.key)} /> {p.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <p className="font-semibold mb-2">Preview</p>
      <Textarea value={report} readOnly className="min-h-[220px] rounded-xl font-mono text-xs" data-testid="share-preview" />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={copyText} className="rounded-xl bg-stone-800 hover:bg-stone-900" data-testid="share-copy-btn"><Copy className="w-4 h-4 mr-1" /> Copy text</Button>
        <Button onClick={downloadPdf} variant="outline" className="rounded-xl" data-testid="share-pdf-btn"><FileDown className="w-4 h-4 mr-1" /> Save as PDF</Button>
        {shareLinks.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" data-testid={`share-link-${l.label.toLowerCase()}`}>
            <Button className={`rounded-xl text-white ${l.c}`}><l.icon className="w-4 h-4 mr-1" /> {l.label}</Button>
          </a>
        ))}
      </div>
    </div>
  );
}
