import {
  Building2, Trees, Heart, Briefcase, Home, Plane, UtensilsCrossed, Sparkles, BookHeart,
} from "lucide-react";

const VISUAL_TYPES = {
  clinic: {
    label: "Clinic visit",
    icon: Building2,
    gradient: "from-sky-100 to-sky-200",
    emoji: "🏥",
  },
  park: {
    label: "Park memory",
    icon: Trees,
    gradient: "from-emerald-100 to-emerald-200",
    emoji: "🌳",
  },
  family: {
    label: "Family moment",
    icon: Heart,
    gradient: "from-rose-100 to-rose-200",
    emoji: "💙",
  },
  meeting: {
    label: "Meeting note",
    icon: Briefcase,
    gradient: "from-violet-100 to-violet-200",
    emoji: "📅",
  },
  home: {
    label: "Home memory",
    icon: Home,
    gradient: "from-amber-100 to-amber-200",
    emoji: "🏠",
  },
  travel: {
    label: "Travel memory",
    icon: Plane,
    gradient: "from-cyan-100 to-cyan-200",
    emoji: "✈️",
  },
  food: {
    label: "Food memory",
    icon: UtensilsCrossed,
    gradient: "from-orange-100 to-orange-200",
    emoji: "🍽️",
  },
  general: {
    label: "Memory",
    icon: Sparkles,
    gradient: "from-stone-100 to-stone-200",
    emoji: "✨",
  },
  book: {
    label: "Memory book",
    icon: BookHeart,
    gradient: "from-fuchsia-100 to-fuchsia-200",
    emoji: "📖",
  },
};

export function detectMemoryVisualType(memory) {
  const text = [
    memory?.title,
    memory?.simple_summary,
    memory?.transcript,
    memory?.category,
    memory?.source,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/meeting note|meeting|call|follow-up|business|office/.test(text)) return "meeting";
  if (/clinic|doctor|dentist|hospital|appointment|medical building/.test(text)) return "clinic";
  if (/park|garden|outdoor|walk/.test(text)) return "park";
  if (/family|daughter|son|grand|visit/.test(text)) return "family";
  if (/home|house|apartment/.test(text)) return "home";
  if (/travel|flight|airport|trip/.test(text)) return "travel";
  if (/food|lunch|dinner|restaurant|meal/.test(text)) return "food";
  if (/memory book|book/.test(text)) return "book";
  return "general";
}

export function getMemoryVisual(memory) {
  const type = detectMemoryVisualType(memory);
  return { type, ...VISUAL_TYPES[type] || VISUAL_TYPES.general };
}
