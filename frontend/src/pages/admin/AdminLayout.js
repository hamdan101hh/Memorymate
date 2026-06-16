import { Outlet, useLocation } from "react-router-dom";
import DashboardShell from "../../components/DashboardShell";
import { LayoutDashboard, Users, Database, ScrollText, DollarSign } from "lucide-react";

const ITEMS = [
  { to: "/admin", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/costs", label: "Costs & Usage", icon: DollarSign },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/data", label: "Database", icon: Database },
  { to: "/admin/logs", label: "Activity Logs", icon: ScrollText },
];

export default function AdminLayout() {
  const { pathname } = useLocation();
  return <DashboardShell items={ITEMS}><Outlet key={pathname} /></DashboardShell>;
}
