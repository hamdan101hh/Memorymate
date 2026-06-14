import { Outlet, useLocation } from "react-router-dom";
import DashboardShell from "../../components/DashboardShell";
import {
  LayoutDashboard, UserRound, Clock, Bell, Pill, CalendarClock,
  Users, MapPin, AlertTriangle, StickyNote, Settings, Radio, ShieldQuestion, Share2, BookHeart, HeartHandshake, MessageSquare, HelpCircle, BellRing, CalendarDays,
} from "lucide-react";

const ITEMS = [
  { to: "/caregiver", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/caregiver/appointments", label: "Appointments", icon: CalendarClock },
  { to: "/caregiver/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/caregiver/reminders", label: "Reminders", icon: Bell },
  { to: "/caregiver/memory-book", label: "Memory Book", icon: BookHeart },
  { to: "/caregiver/people", label: "People", icon: Users },
  { to: "/caregiver/capture/review", label: "Privacy Review", icon: ShieldQuestion },
  { to: "/caregiver/settings", label: "Settings", icon: Settings },
  { type: "section", label: "More" },
  { to: "/caregiver/overview", label: "Supported person", icon: UserRound },
  { to: "/caregiver/timeline", label: "Daily timeline", icon: Clock },
  { to: "/caregiver/medication", label: "Medication", icon: Pill },
  { to: "/caregiver/places", label: "Places", icon: MapPin },
  { to: "/caregiver/family", label: "Family circle", icon: HeartHandshake },
  { to: "/caregiver/capture", label: "Record memory", icon: Radio },
  { to: "/caregiver/capture/sessions", label: "Capture sessions", icon: Radio },
  { to: "/caregiver/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/caregiver/notes", label: "Caregiver notes", icon: StickyNote },
  { to: "/caregiver/share", label: "Share & export", icon: Share2 },
  { to: "/caregiver/notifications", label: "Notifications", icon: BellRing },
  { to: "/caregiver/whatsapp", label: "WhatsApp setup", icon: MessageSquare },
  { to: "/how-it-works", label: "How it works", icon: HelpCircle },
];

export default function CaregiverLayout() {
  const { pathname } = useLocation();
  return <DashboardShell items={ITEMS}><Outlet key={pathname} /></DashboardShell>;
}
