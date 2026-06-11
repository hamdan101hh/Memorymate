import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { Logo } from "../components/common";
import PurposeSelector from "../components/PurposeSelector";
import { PRODUCT_SAFETY_LINE } from "../lib/purposeConfig";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import { Sparkles, ShieldCheck, Phone, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState(user?.memorymate_purpose || "");
  const [consent, setConsent] = useState(user?.consent_accepted || false);
  const [ecName, setEcName] = useState(user?.emergency_contact_name || "");
  const [ecPhone, setEcPhone] = useState(user?.emergency_contact_phone || "");
  const [saving, setSaving] = useState(false);

  const home = user?.role === "patient" ? "/patient" : "/caregiver";

  const finish = async () => {
    setSaving(true);
    try {
      await api.patch("/auth/onboarding", {
        memorymate_purpose: purpose || "unsure",
        consent_accepted: consent,
        emergency_contact_name: ecName || null,
        emergency_contact_phone: ecPhone || null,
        onboarding_completed: true,
      });
      await refreshUser();
      toast.success("All set! Welcome to MemoryMate.");
      navigate(home);
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      icon: Sparkles,
      color: "bg-sky-600",
      title: "What would you like to use MemoryMate for?",
      body: "Choose what fits best. You can change this anytime in Settings.",
      content: (
        <div className="mt-6 text-left max-h-[50vh] overflow-y-auto mm-scrollbar">
          <PurposeSelector value={purpose} onChange={setPurpose} testIdPrefix="onboarding-purpose" />
        </div>
      ),
      canNext: () => !!purpose,
    },
    {
      icon: Sparkles,
      color: "bg-emerald-600",
      title: "Welcome to MemoryMate",
      body: "MemoryMate helps you remember, organize, and share what matters — reminders, appointments, memory notes, and family support in one calm place.",
      content: null,
      canNext: () => true,
    },
    {
      icon: ShieldCheck,
      color: "bg-sky-600",
      title: "Privacy and consent",
      body: "Notes and recordings may be processed to create simple summaries and reminders. You stay in control of what is saved and shared.",
      content: (
        <label className="flex items-start gap-3 mt-6 cursor-pointer text-left bg-stone-50 rounded-2xl p-4 border border-stone-200">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" data-testid="onboarding-consent-checkbox" />
          <span className="text-stone-700">I understand and agree.</span>
        </label>
      ),
      canNext: () => consent,
    },
    {
      icon: ShieldCheck,
      color: "bg-amber-500",
      title: "A quick safety note",
      body: PRODUCT_SAFETY_LINE,
      content: null,
      canNext: () => true,
    },
    {
      icon: Phone,
      color: "bg-rose-600",
      title: "Add a trusted contact",
      body: "Someone you can reach quickly for day-to-day help. You can change this anytime in Settings.",
      content: (
        <div className="mt-6 space-y-3 text-left">
          <Input placeholder="Contact name" value={ecName} onChange={(e) => setEcName(e.target.value)} className="h-12 rounded-xl" data-testid="onboarding-ec-name" />
          <Input placeholder="Contact phone" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} className="h-12 rounded-xl" data-testid="onboarding-ec-phone" />
        </div>
      ),
      canNext: () => true,
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;
  const canNext = s.canNext();

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col" data-testid="onboarding-page">
      <header className="p-5"><Logo to="/" /></header>
      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md text-center mm-fade-up" key={step}>
          <Progress value={((step + 1) / steps.length) * 100} className="h-2 mb-8" />
          <span className={`grid place-items-center w-20 h-20 rounded-3xl ${s.color} text-white mx-auto shadow-md`}>
            <s.icon className="w-10 h-10" strokeWidth={1.8} />
          </span>
          <h1 className="font-heading text-3xl font-bold mt-7">{s.title}</h1>
          <p className="mt-3 text-lg text-stone-600 leading-relaxed">{s.body}</p>
          {s.content}

          <div className="mt-10 flex items-center gap-3">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((x) => x - 1)} className="h-13 rounded-xl px-5" data-testid="onboarding-back-btn">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            {!last ? (
              <Button
                onClick={() => canNext && setStep((x) => x + 1)}
                disabled={!canNext}
                className="flex-1 h-13 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-base"
                data-testid="onboarding-next-btn"
              >
                Continue <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="flex-1 h-13 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-base" data-testid="onboarding-finish-btn">
                <Check className="w-5 h-5 mr-1" /> Finish setup
              </Button>
            )}
          </div>
          <button onClick={finish} className="mt-5 text-sm text-stone-400 hover:text-stone-600" data-testid="onboarding-skip-btn">Skip for now</button>
        </div>
      </main>
    </div>
  );
}
