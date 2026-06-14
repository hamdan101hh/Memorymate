/** MemoryMate use-case purpose — safe general wording (not medical). */
export const PURPOSE_VALUES = [
  "self",
  "busy_schedule",
  "family_support",
  "extra_support",
  "caregiver",
  "unsure",
];

export const PURPOSE_OPTIONS = [
  {
    value: "self",
    title: "For myself",
    subtitle: "Organize reminders, appointments, notes, and important memories.",
  },
  {
    value: "busy_schedule",
    title: "For a busy schedule",
    subtitle: "Keep track of meetings, tasks, follow-ups, and daily priorities.",
  },
  {
    value: "family_support",
    title: "For family support",
    subtitle: "Help a family member stay organized with reminders and shared notes.",
  },
  {
    value: "extra_support",
    title: "For extra day-to-day support",
    subtitle: "Make it easier to remember important things, people, and plans.",
  },
  {
    value: "caregiver",
    title: "For a caregiver",
    subtitle: "Coordinate appointments, reminders, memories, and daily updates.",
  },
  {
    value: "unsure",
    title: "I'm not sure yet",
    subtitle: "Start simple and customize later.",
  },
];

export const PRODUCT_SAFETY_LINE =
  "MemoryMate is for daily-life organization and support. It is not medical advice, diagnosis, treatment, or emergency support.";

export const COST_LINE = "Start simple. Connect only what you need.";

function labelFor(value) {
  return PURPOSE_OPTIONS.find((o) => o.value === value)?.title || "MemoryMate";
}

/** Dashboard title + subtitle for caregiver home — prefers adaptive mode when set. */
export function getCaregiverDashboardCopy(purpose, role, mode) {
  const modeMap = {
    private_executive: {
      title: "Your private workspace",
      subtitle: "Meetings, reminders, appointments, and notes — kept private to you.",
    },
    daily_memory_support: {
      title: "Daily memory support",
      subtitle: "Gentle check-ins, reminders, and summaries for everyday organization.",
    },
    trusted_supporter: {
      title: "Trusted supporter overview",
      subtitle: "Coordinate reminders, appointments, and memories with consent.",
    },
    decide_later: {
      title: "Today's overview",
      subtitle: "Start simple — invite a trusted supporter anytime from Family circle.",
    },
  };
  if (mode && modeMap[mode]) {
    return modeMap[mode];
  }
  const p = purpose || (role === "caregiver" ? "caregiver" : "unsure");
  const map = {
    self: {
      title: "Your day",
      subtitle: "Reminders, appointments, notes, and your memory book in one calm place.",
    },
    busy_schedule: {
      title: "Today's priorities",
      subtitle: "Meetings, follow-ups, tasks, and calendar — organized for your busy schedule.",
    },
    family_support: {
      title: "Family support overview",
      subtitle: "Shared reminders, appointments, important people, and family notes.",
    },
    extra_support: {
      title: "Today made simple",
      subtitle: "Clear reminders, important people, and gentle summaries for daily life.",
    },
    caregiver: {
      title: "Caregiver overview",
      subtitle: "Appointments, reminders, memories, and support in one place.",
    },
    unsure: {
      title: "Today's overview",
      subtitle: "Appointments, reminders, memories, and daily-life support in one place.",
    },
  };
  return map[p] || map.unsure;
}

/** Patient home greeting area copy — prefers adaptive mode when set. */
export function getPatientHomeCopy(purposeOrMode) {
  const modeMap = {
    private_executive: {
      tagline: "Your private space for meetings, notes, reminders, appointments, and ideas.",
    },
    daily_memory_support: {
      tagline: "Gentle check-ins, daily summaries, and reminders for the important things.",
    },
    trusted_supporter: {
      tagline: "Your day, organized — invite a trusted supporter when you're ready.",
    },
    decide_later: {
      tagline: "Your reminders and memories are here. Customize anytime.",
    },
  };
  if (purposeOrMode && modeMap[purposeOrMode]) {
    return modeMap[purposeOrMode];
  }
  const p = purposeOrMode || "self";
  const map = {
    self: { tagline: "Your day, organized calmly." },
    busy_schedule: { tagline: "Today's priorities at a glance." },
    family_support: { tagline: "Stay organized with your family's support." },
    extra_support: { tagline: "Today made simple." },
    caregiver: { tagline: "Daily-life support, step by step." },
    unsure: { tagline: "Your reminders and memories are here." },
  };
  return map[p] || map.self;
}

/** Which quick-action keys to emphasize on caregiver dashboard. */
export function getCaregiverQuickActionKeys(purpose) {
  const p = purpose || "unsure";
  const map = {
    self: ["reminder", "memory", "note", "calendar"],
    busy_schedule: ["ai", "calendar", "reminder", "duplicates"],
    family_support: ["reminder", "people", "note", "calendar"],
    extra_support: ["reminder", "memory", "people", "calendar"],
    caregiver: ["ai", "reminder", "note", "calendar", "duplicates", "memory"],
    unsure: ["ai", "reminder", "note", "calendar", "memory"],
  };
  return map[p] || map.unsure;
}

export { labelFor as purposeLabel };
