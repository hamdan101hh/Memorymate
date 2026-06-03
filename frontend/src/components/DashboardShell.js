import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./common";
import { Button } from "./ui/button";
import { Menu, X, LogOut } from "lucide-react";

export default function DashboardShell({ items, title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const Side = (
    <aside className="w-64 shrink-0 bg-white border-r border-stone-200 flex flex-col h-full">
      <div className="h-16 px-5 flex items-center border-b border-stone-100"><Logo to={items[0].to} /></div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto mm-scrollbar">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} onClick={() => setOpen(false)}
            data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? "bg-sky-50 text-sky-700" : "text-stone-600 hover:bg-stone-50"}`}>
            <it.icon className="w-5 h-5" /> {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-stone-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-semibold truncate">{user?.full_name}</p>
          <p className="text-xs text-stone-400 capitalize">{user?.role}</p>
        </div>
        <Button variant="ghost" onClick={() => { logout(); navigate("/"); }} className="w-full justify-start rounded-xl text-stone-600" data-testid="dashboard-logout-btn">
          <LogOut className="w-4 h-4 mr-2" /> Log out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-stone-50">
      <div className="hidden lg:block">{Side}</div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full">{Side}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden h-16 bg-white border-b border-stone-200 px-4 flex items-center justify-between sticky top-0 z-30">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} data-testid="mobile-menu-btn"><Menu className="w-6 h-6" /></Button>
          <Logo to={items[0].to} />
          <div className="w-10" />
        </header>
        <main className="flex-1 p-5 sm:p-7 overflow-x-hidden">
          {title && <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-6">{title}</h1>}
          {children}
        </main>
      </div>
    </div>
  );
}
