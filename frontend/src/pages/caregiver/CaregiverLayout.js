import { Outlet } from "react-router-dom";
import DashboardShell from "../../components/DashboardShell";
import {
  LayoutDashboard, UserRound, Clock, Bell, Pill, CalendarClock,
  Users, MapPin, AlertTriangle, StickyNote, Settings,
} from "lucide-react";

const ITEMS = [
  { to: "/caregiver", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/caregiver/overview", label: "Patient Overview", icon: UserRound },
  { to: "/caregiver/timeline", label: "Daily Timeline", icon: Clock },
  { to: "/caregiver/reminders", label: "Reminders", icon: Bell },
  { to: "/caregiver/medication", label: "Medication", icon: Pill },
  { to: "/caregiver/appointments", label: "Appointments", icon: CalendarClock },
  { to: "/caregiver/people", label: "Important People", icon: Users },
  { to: "/caregiver/places", label: "Important Places", icon: MapPin },
  { to: "/caregiver/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/caregiver/notes", label: "Caregiver Notes", icon: StickyNote },
  { to: "/caregiver/settings", label: "Settings", icon: Settings },
];

export default function CaregiverLayout() {
  return <DashboardShell items={ITEMS}><Outlet /></DashboardShell>;
}
