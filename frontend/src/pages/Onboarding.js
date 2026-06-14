import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { Logo } from "../components/common";
import OnboardingOptionGroup from "../components/OnboardingOptionGroup";
import {
  MAIN_GOAL_OPTIONS,
  PRIVACY_OPTIONS,
  FREQUENCY_OPTIONS,
  FORGET_OPTIONS,
  MODE_OPTIONS,
  recommendMode,
  recommendationMessage,
  supporterInvitePreference,
} from "../lib/onboardingConfig";
import { PRODUCT_SAFETY_LINE } from "../lib/purposeConfig";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import { Sparkles, ShieldCheck, Phone, ArrowRight, ArrowLeft, Check, Users } from "lucide-react";
import { toast } from "sonner";

export default function Onboarding() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [mainGoal, setMainGoal] = useState(user?.main_goal || "");
  const [privacyChoice, setPrivacyChoice] = useState(user?.privacy_choice || "");
  const [checkInFrequency, setCheckInFrequency] = useState(user?.check_in_frequency || "");
  const [forgetfulnessFrequency, setForgetfulnessFrequency] = useState(user?.forgetfulness_frequency || "");
  const [selectedMode, setSelectedMode] = useState(user?.memorymate_mode || "");
  const [consent, setConsent] = useState(user?.consent_accepted || false);
  const [ecName, setEcName] = useState(user?.emergency_contact_name || "");
  const [ecPhone, setEcPhone] = useState(user?.emergency_contact_phone || "");
  const [saving, setSaving] = useState(false);

  const home = user?.role === "patient" ? "/patient" : "/caregiver";

  const recommendedMode = useMemo(() => {
    if (!mainGoal || !privacyChoice || !checkInFrequency || !forgetfulnessFrequency) return "decide_later";
    return recommendMode(mainGoal, privacyChoice, checkInFrequency, forgetfulnessFrequency);
  }, [mainGoal, privacyChoice, checkInFrequency, forgetfulnessFrequency]);

  useEffect(() => {
    if (step === 3 && !selectedMode) {
      setSelectedMode(recommendedMode);
    }
  }, [step, recommendedMode, selectedMode]);

  const finish = async () => {
    setSaving(true);
    try {
      const mode = selectedMode || recommendedMode || "decide_later";
      await api.patch("/auth/onboarding", {
        memorymate_mode: mode,
        main_goal: mainGoal || "not_sure",
        privacy_choice: privacyChoice || "decide_later",
        check_in_frequency: checkInFrequency || "sometimes",
        forgetfulness_frequency: forgetfulnessFrequency || "prefer_not_to_say",
        supporter_invite_preference: supporterInvitePreference(privacyChoice || "decide_later"),
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
      title: "What would you like MemoryMate to help you with?",
      body: "Choose what fits best. You can change this anytime in Settings.",
      content: (
        <div className="mt-6 max-h-[50vh] overflow-y-auto mm-scrollbar">
          <OnboardingOptionGroup
            options={MAIN_GOAL_OPTIONS}
            value={mainGoal}
            onChange={setMainGoal}
            testIdPrefix="onboarding-goal"
          />
        </div>
      ),
      canNext: () => !!mainGoal,
    },
    {
      icon: Users,
      color: "bg-violet-600",
      title: "Would you like to keep MemoryMate private, or invite someone you trust?",
      body: "You can always change this later. Inviting someone is never required.",
      content: (
        <div className="mt-6">
          <OnboardingOptionGroup
            options={PRIVACY_OPTIONS}
            value={privacyChoice}
            onChange={setPrivacyChoice}
            testIdPrefix="onboarding-privacy"
          />
        </div>
      ),
      canNext: () => !!privacyChoice,
    },
    {
      icon: Sparkles,
      color: "bg-emerald-600",
      title: "A few gentle questions",
      body: "This helps MemoryMate suggest a setup — not a diagnosis or score.",
      content: (
        <div className="mt-6 space-y-6 text-left">
          <div>
            <p className="font-medium text-stone-800 mb-2">How often do you want MemoryMate to check in?</p>
            <OnboardingOptionGroup
              options={FREQUENCY_OPTIONS}
              value={checkInFrequency}
              onChange={setCheckInFrequency}
              testIdPrefix="onboarding-checkin"
            />
          </div>
          <div>
            <p className="font-medium text-stone-800 mb-2">
              How often do you forget appointments, tasks, or what happened earlier?
            </p>
            <OnboardingOptionGroup
              options={FORGET_OPTIONS}
              value={forgetfulnessFrequency}
              onChange={setForgetfulnessFrequency}
              testIdPrefix="onboarding-forget"
            />
          </div>
        </div>
      ),
      canNext: () => !!checkInFrequency && !!forgetfulnessFrequency,
    },
    {
      icon: Sparkles,
      color: "bg-amber-500",
      title: "Recommended setup",
      body: recommendationMessage(
        recommendedMode,
        privacyChoice,
        checkInFrequency,
        forgetfulnessFrequency,
      ),
      content: (
        <div className="mt-6 max-h-[50vh] overflow-y-auto mm-scrollbar">
          <p className="text-sm text-stone-600 mb-3 text-left">You can pick a different mode if you prefer.</p>
          <OnboardingOptionGroup
            options={MODE_OPTIONS}
            value={selectedMode || recommendedMode}
            onChange={setSelectedMode}
            testIdPrefix="onboarding-mode"
          />
        </div>
      ),
      canNext: () => !!(selectedMode || recommendedMode),
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
      title: "Add a trusted contact (optional)",
      body: "Someone you can reach quickly for day-to-day help. You can skip or add this later in Settings.",
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
  const showSupporterHint =
    (selectedMode || recommendedMode) === "trusted_supporter" && user?.role === "caregiver";

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

          {showSupporterHint && step >= 3 && (
            <p className="mt-4 text-sm text-stone-600 bg-violet-50 border border-violet-100 rounded-xl p-3 text-left">
              After setup, open <strong>Family circle</strong> to invite a trusted supporter. Sharing is always your choice.
            </p>
          )}

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
