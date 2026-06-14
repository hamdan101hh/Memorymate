import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Home, Settings, LogOut } from "lucide-react";

export default function PatientLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/patient";

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200">
        <div className="max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo to="/patient" />
          <div className="flex items-center gap-1">
            {!isHome && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/patient")} className="rounded-xl" aria-label="Home" data-testid="patient-home-btn">
                <Home className="w-6 h-6" />
              </Button>
            )}
            <Link to="/patient/settings">
              <Button variant="ghost" size="icon" className="rounded-xl" aria-label="Settings" data-testid="patient-settings-btn">
                <Settings className="w-6 h-6" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate("/"); }} className="rounded-xl" aria-label="Log out" data-testid="patient-logout-btn">
              <LogOut className="w-6 h-6" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-7 pb-16">
        <Outlet key={pathname} />
      </main>
    </div>
  );
}

export function PatientPageHeader({ title, subtitle }) {
  const navigate = useNavigate();
  return (
    <div className="mb-7">
      <button onClick={() => navigate("/patient")} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1 text-base" data-testid="page-back-btn">
        ← Back to home
      </button>
      <h1 className="font-heading text-3xl sm:text-4xl font-bold">{title}</h1>
      {subtitle && <p className="text-lg text-stone-600 mt-1">{subtitle}</p>}
    </div>
  );
}
