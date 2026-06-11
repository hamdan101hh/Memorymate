import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { formatApiError } from "../../lib/api";
import { Logo, Disclaimer } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Textarea } from "../../components/ui/textarea";
import { Loader2, User, HeartHandshake } from "lucide-react";
import { toast } from "sonner";

export default function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("patient");
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({
    full_name: "", email: "", password: "", phone: "",
    emergency_contact_name: "", emergency_contact_phone: "", consent: false,
    p_name: "", p_age: "", p_rel: "", p_ec_name: "", p_ec_phone: "", p_notes: "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.consent) { toast.error("Please accept consent to continue."); return; }
    setLoading(true);
    const payload = {
      full_name: f.full_name, email: f.email, password: f.password, role,
      phone: f.phone || null, emergency_contact_name: f.emergency_contact_name || null,
      emergency_contact_phone: f.emergency_contact_phone || null, consent_accepted: f.consent,
    };
    if (role === "caregiver") {
      payload.patient_info = {
        full_name: f.p_name || "My Loved One", age: f.p_age ? Number(f.p_age) : null,
        relationship: f.p_rel || null, emergency_contact_name: f.p_ec_name || null,
        emergency_contact_phone: f.p_ec_phone || null, notes: f.p_notes || null,
      };
    }
    try {
      const user = await register(payload);
      toast.success("Account created! Let's set things up.");
      navigate("/onboarding");
      return user;
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const RoleBtn = ({ value, icon: Icon, title, desc }) => (
    <button type="button" onClick={() => setRole(value)} data-testid={`role-${value}-btn`}
      className={`flex-1 text-left rounded-2xl border-2 p-4 transition-all ${
        role === value ? "border-sky-600 bg-sky-50" : "border-stone-200 hover:border-stone-300"}`}>
      <Icon className={`w-6 h-6 ${role === value ? "text-sky-600" : "text-stone-400"}`} />
      <p className="mt-2 font-semibold">{title}</p>
      <p className="text-xs text-stone-500">{desc}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-stone-50 py-10 px-5">
      <div className="max-w-lg mx-auto">
        <Logo to="/" />
        <h2 className="font-heading text-3xl font-bold mt-8">Create your account</h2>
        <p className="text-stone-500 mt-1">Get started in a minute.</p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <div className="flex gap-3">
            <RoleBtn value="patient" icon={User} title="For myself" desc="Your own reminders and memories" />
            <RoleBtn value="caregiver" icon={HeartHandshake} title="To support someone" desc="Family supporter / caregiver account" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="fn">Full name</Label>
              <Input id="fn" required value={f.full_name} onChange={set("full_name")} className="mt-1.5 h-12 rounded-xl" data-testid="signup-name-input" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" required value={f.email} onChange={set("email")} className="mt-1.5 h-12 rounded-xl" data-testid="signup-email-input" />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required minLength={6} value={f.password} onChange={set("password")} className="mt-1.5 h-12 rounded-xl" data-testid="signup-password-input" />
            </div>
            <div>
              <Label htmlFor="ph">Phone <span className="text-stone-400">(optional)</span></Label>
              <Input id="ph" value={f.phone} onChange={set("phone")} className="mt-1.5 h-12 rounded-xl" data-testid="signup-phone-input" />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 p-4 space-y-4">
            <p className="text-sm font-semibold text-stone-700">Emergency contact <span className="text-stone-400 font-normal">(optional)</span></p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input placeholder="Contact name" value={f.emergency_contact_name} onChange={set("emergency_contact_name")} className="h-12 rounded-xl" data-testid="signup-ec-name-input" />
              <Input placeholder="Contact phone" value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} className="h-12 rounded-xl" data-testid="signup-ec-phone-input" />
            </div>
          </div>

          {role === "caregiver" && (
            <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/50 p-4 space-y-4" data-testid="patient-connection-block">
              <p className="text-sm font-semibold text-sky-800">Who are you caring for?</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input placeholder="Patient full name" value={f.p_name} onChange={set("p_name")} className="h-12 rounded-xl bg-white" data-testid="signup-patient-name-input" />
                <Input placeholder="Age" type="number" value={f.p_age} onChange={set("p_age")} className="h-12 rounded-xl bg-white" data-testid="signup-patient-age-input" />
                <Input placeholder="Your relationship (e.g. Daughter)" value={f.p_rel} onChange={set("p_rel")} className="h-12 rounded-xl bg-white" data-testid="signup-patient-rel-input" />
                <Input placeholder="Patient emergency phone" value={f.p_ec_phone} onChange={set("p_ec_phone")} className="h-12 rounded-xl bg-white" />
              </div>
              <Textarea placeholder="Notes about the person you care for (optional)" value={f.p_notes} onChange={set("p_notes")} className="rounded-xl bg-white" />
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={f.consent} onCheckedChange={(v) => setF((s) => ({ ...s, consent: !!v }))} className="mt-1" data-testid="signup-consent-checkbox" />
            <span className="text-sm text-stone-600">
              I understand and agree that recordings and notes may be processed by AI to create summaries
              and reminders, and I accept the <Link to="/privacy" className="text-sky-700 underline">Privacy</Link> and{" "}
              <Link to="/safety" className="text-sky-700 underline">Safety</Link> terms.
            </span>
          </label>

          <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-sky-600 hover:bg-sky-700 text-base" data-testid="signup-submit-btn">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-stone-600">
          Already have an account? <Link to="/login" className="text-sky-700 font-semibold hover:underline">Log in</Link>
        </p>
        <div className="mt-8"><Disclaimer /></div>
      </div>
    </div>
  );
}
