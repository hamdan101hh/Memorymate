/** Adaptive onboarding — modes, questions, recommendations (no medical/diagnosis wording). */

export const MAIN_GOAL_OPTIONS = [
  { value: "remember_tasks", label: "Remember tasks and appointments" },
  { value: "capture_meetings_ideas", label: "Capture meetings, conversations, and ideas" },
  { value: "organize_personal", label: "Organize my personal life" },
  { value: "extra_memory_support", label: "Get extra support remembering my day" },
  { value: "help_someone", label: "Help someone I care about" },
  { value: "not_sure", label: "I'm not sure yet" },
];

export const PRIVACY_OPTIONS = [
  { value: "private", label: "Keep it private for me" },
  { value: "trusted_supporter", label: "Invite a trusted supporter" },
  { value: "decide_later", label: "Decide later" },
];

export const FREQUENCY_OPTIONS = [
  { value: "rarely", label: "Rarely" },
  { value: "sometimes", label: "Sometimes" },
  { value: "often", label: "Often" },
  { value: "very_often", label: "Very often" },
];

export const FORGET_OPTIONS = [
  ...FREQUENCY_OPTIONS,
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const MODE_OPTIONS = [
  {
    value: "private_executive",
    title: "Private Executive Mode",
    subtitle: "Keep MemoryMate private for me — meetings, reminders, notes, and appointments.",
  },
  {
    value: "daily_memory_support",
    title: "Daily Memory Support Mode",
    subtitle: "Give me extra help remembering my day — gentle check-ins and summaries.",
  },
  {
    value: "trusted_supporter",
    title: "Trusted Supporter Mode",
    subtitle: "Invite someone I trust to help — family, friend, or support person.",
  },
  {
    value: "decide_later",
    title: "Decide Later",
    subtitle: "I'll decide later — start private and customize anytime.",
  },
];

const FREQ_SCORE = { rarely: 0, sometimes: 1, often: 2, very_often: 3, prefer_not_to_say: 1 };

export function supportScore(checkIn, forget) {
  return (FREQ_SCORE[checkIn] ?? 1) + (FREQ_SCORE[forget] ?? 1);
}

/** Recommended mode from answers — user can always override. */
export function recommendMode(mainGoal, privacyChoice, checkIn, forget) {
  if (privacyChoice === "trusted_supporter" || mainGoal === "help_someone") {
    return "trusted_supporter";
  }
  const score = supportScore(checkIn, forget);
  const productivityGoals = new Set([
    "remember_tasks",
    "capture_meetings_ideas",
    "organize_personal",
    "not_sure",
  ]);
  if (score <= 2 && productivityGoals.has(mainGoal) && privacyChoice !== "decide_later") {
    return "private_executive";
  }
  if (privacyChoice === "decide_later" && score <= 2 && mainGoal === "not_sure") {
    return "decide_later";
  }
  return "daily_memory_support";
}

export function recommendationMessage(mode, privacyChoice, checkIn, forget) {
  const score = supportScore(checkIn, forget);
  if (mode === "trusted_supporter") {
    return "Trusted Supporter Mode looks best for you. You can invite someone you trust — never required.";
  }
  if (mode === "private_executive") {
    return "Private Executive Mode looks best for you — private notes, meetings, and reminders.";
  }
  if (mode === "decide_later") {
    return "You can start private and choose more support later.";
  }
  if (score >= 4 && privacyChoice === "private") {
    return "Daily Memory Support Mode looks best for you. A trusted supporter is optional later.";
  }
  return "Daily Memory Support Mode looks best for you — gentle check-ins and daily organization.";
}

export function supporterInvitePreference(privacyChoice) {
  if (privacyChoice === "trusted_supporter") return "now";
  if (privacyChoice === "decide_later") return "later";
  return "no";
}

export function modeLabel(mode) {
  return MODE_OPTIONS.find((m) => m.value === mode)?.title || "MemoryMate";
}
