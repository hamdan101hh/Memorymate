import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { formatApiError } from "../../lib/api";
import { Logo, Disclaimer } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEMOS = [
  { label: "Patient (Omar)", email: "omar@memorymate.app", password: "Patient123!" },
  { label: "Caregiver (Sarah)", email: "sarah@memorymate.app", password: "Caregiver123!" },
  { label: "Admin", email: "admin@memorymate.app", password: "admin123" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const go = (role) => navigate(role === "patient" ? "/patient" : role === "admin" ? "/admin" : "/caregiver");

  const submit = async (e, creds) => {
    e?.preventDefault();
    const c = creds || { email, password };
    setLoading(true);
    try {
      const user = await login(c.email, c.password);
      toast.success(`Welcome back, ${user.full_name.split(" ")[0]}!`);
      go(user.role);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-stone-50">
      <div className="hidden lg:flex flex-col justify-between bg-sky-600 text-white p-12">
        <Logo onDark to="/" />
        <div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight">Welcome back.</h1>
          <p className="mt-4 text-sky-100 text-lg max-w-md">Your reminders and memories are safe and waiting for you.</p>
        </div>
        <p className="text-sky-200 text-sm">Helping families remember, care, and stay connected.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Logo to="/" /></div>
          <h2 className="font-heading text-3xl font-bold">Log in</h2>
          <p className="text-stone-500 mt-1">Enter your details to continue.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-12 rounded-xl" placeholder="you@example.com" data-testid="login-email-input" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-12 rounded-xl" placeholder="••••••••" data-testid="login-password-input" />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="login-submit-btn">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Log in"}
            </Button>
          </form>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 text-center">Quick demo login</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {DEMOS.map((d) => (
                <button key={d.label} disabled={loading} onClick={(e) => submit(e, d)}
                  className="text-xs font-medium border border-stone-200 rounded-xl py-2 px-1 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                  data-testid={`demo-login-${d.label.split(" ")[0].toLowerCase()}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-stone-600">
            New here? <Link to="/signup" className="text-sky-700 font-semibold hover:underline">Create an account</Link>
          </p>
          <div className="mt-8"><Disclaimer /></div>
        </div>
      </div>
    </div>
  );
}
