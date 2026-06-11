import { Link } from "react-router-dom";
import { Logo, Disclaimer, LEGAL_LINKS, SUPPORT_EMAIL } from "../../components/common";
import { COST_LINE, PRODUCT_SAFETY_LINE } from "../../lib/purposeConfig";
import { Button } from "../../components/ui/button";
import {
  Mic, Sparkles, Bell, Users, ShieldCheck, HeartHandshake,
  CalendarClock, ArrowRight, Check,
} from "lucide-react";

const HERO_IMG =
  "https://images.unsplash.com/photo-1765896387387-0538bc9f997e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NjV8MHwxfHNlYXJjaHwyfHxlbGRlcmx5JTIwc2VuaW9yJTIwc21pbGluZyUyMGNhcmVnaXZlciUyMGhvbGRpbmclMjBoYW5kc3xlbnwwfHx8fDE3ODA0ODk4MDZ8MA&ixlib=rb-4.1.0&q=85";
const FAMILY_IMG =
  "https://images.unsplash.com/photo-1758686254056-6cd980b9aaee?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA0MTJ8MHwxfHNlYXJjaHw0fHxmYW1pbHklMjBsaWZlc3R5bGUlMjBoYXBweSUyMHNlbmlvciUyMHJlbGF4aW5nfGVufDB8fHx8MTc4MDQ4OTgwNnww&ixlib=rb-4.1.0&q=85";

function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-stone-50/85 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-600">
          <Link to="/how-it-works" className="hover:text-stone-900 transition-colors">How it works</Link>
          <a href="#features" className="hover:text-stone-900 transition-colors">Features</a>
          <a href="#safety" className="hover:text-stone-900 transition-colors">Safety</a>
          <Link to="/about" className="hover:text-stone-900 transition-colors">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login"><Button variant="ghost" className="rounded-xl" data-testid="nav-login-btn">Log in</Button></Link>
          <Link to="/signup"><Button className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="nav-signup-btn">Get Started</Button></Link>
        </div>
      </div>
    </header>
  );
}

const STEPS = [
  { n: "1", t: "Capture a moment or task", d: "Speak or type what happened — a meeting, reminder, or memory worth keeping." },
  { n: "2", t: "Get a simple summary", d: "MemoryMate turns it into a calm, easy-to-read note you can review." },
  { n: "3", t: "Stay organized", d: "Appointments, reminders, people, and places stay in one place." },
  { n: "4", t: "Share with people you trust", d: "Family supporters can help coordinate — always with your control." },
];

const FEATURES = [
  { icon: SunIcon, t: "Remember your day", d: "Gentle summaries and reminders for what matters today." },
  { icon: CalendarClock, t: "Organize appointments", d: "Track visits, meetings, and follow-ups with optional Google Calendar." },
  { icon: Mic, t: "Capture important moments", d: "Record memories and notes when you want — pause anytime." },
  { icon: HeartHandshake, t: "Support someone you care about", d: "Help a family member stay organized with shared reminders." },
  { icon: Users, t: "Keep family updated", d: "Coordinate with trusted supporters and family circle." },
  { icon: ShieldCheck, t: "Stay in control of privacy", d: "Review before sharing. Consent-based capture." },
];

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Nav />

      <section className="max-w-6xl mx-auto px-5 pt-12 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div className="mm-fade-up">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 bg-sky-100 px-3 py-1.5 rounded-full">
            <Sparkles className="w-4 h-4" /> Daily-life memory and organization
          </span>
          <h1 className="mt-5 font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
            MemoryMate helps you remember, organize, and share what matters.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-stone-600 leading-relaxed max-w-xl">
            Simple reminders, appointments, memory notes, and family support — all in one calm place.
          </p>
          <p className="mt-3 text-sm text-stone-500">{COST_LINE}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg" className="rounded-2xl h-14 px-8 text-base bg-sky-600 hover:bg-sky-700 shadow-md" data-testid="hero-get-started-btn">
                Get Started <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="rounded-2xl h-14 px-8 text-base border-stone-300" data-testid="hero-demo-btn">
                View Demo
              </Button>
            </Link>
          </div>
          <p className="mt-5 text-sm text-stone-500 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" /> Google Calendar optional · AI fallback without paid services required
          </p>
        </div>
        <div className="relative mm-fade-up" style={{ animationDelay: "0.1s" }}>
          <div className="absolute -inset-4 bg-gradient-to-tr from-sky-200/60 to-emerald-200/50 rounded-[2.5rem] blur-2xl" />
          <img src={HERO_IMG} alt="Person with family supporter" className="relative rounded-[2rem] shadow-xl w-full object-cover aspect-[4/3]" />
          <div className="absolute -bottom-5 -left-3 bg-white rounded-2xl shadow-lg border border-stone-100 p-4 flex items-center gap-3 max-w-[230px]">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700"><Bell className="w-5 h-5" /></span>
            <div>
              <p className="text-sm font-semibold leading-tight">Team meeting</p>
              <p className="text-xs text-stone-500">Today · 2:00 PM</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="bg-white border-y border-stone-200 py-20">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-center">How it works</h2>
          <p className="text-center text-stone-600 mt-3 max-w-2xl mx-auto">Four simple steps from a note or memory to an organized day.</p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-stone-200 p-6 hover:border-sky-300 hover:shadow-md transition-all">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-sky-600 text-white font-heading font-bold text-lg">{s.n}</span>
                <h3 className="mt-4 font-heading font-semibold text-lg">{s.t}</h3>
                <p className="mt-2 text-stone-600 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <img src={FAMILY_IMG} alt="Family staying connected" className="rounded-[2rem] shadow-lg w-full object-cover aspect-[5/4]" />
          </div>
          <div>
            <h2 className="font-heading text-3xl sm:text-4xl font-bold">Everything in one calm place</h2>
            <p className="mt-3 text-stone-600">For yourself, a busy schedule, family coordination, or extra day-to-day support.</p>
            <div className="mt-8 grid sm:grid-cols-2 gap-5">
              {FEATURES.map((f) => (
                <div key={f.t} className="flex gap-3">
                  <span className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700"><f.icon className="w-5 h-5" /></span>
                  <div>
                    <h3 className="font-semibold">{f.t}</h3>
                    <p className="text-sm text-stone-600">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="safety" className="bg-stone-900 text-white py-20">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white/10 mx-auto"><ShieldCheck className="w-7 h-7" /></span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold mt-6">Daily-life support, clearly stated.</h2>
          <p className="mt-4 text-stone-300 leading-relaxed">{PRODUCT_SAFETY_LINE}</p>
          <Link to="/safety"><Button variant="outline" className="mt-7 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10">Read our safety commitment</Button></Link>
        </div>
      </section>

      <section className="py-20 max-w-4xl mx-auto px-5 text-center">
        <h2 className="font-heading text-3xl sm:text-4xl font-bold">Start simple with MemoryMate.</h2>
        <p className="mt-3 text-stone-600">Create a free account for yourself or to support someone you care about.</p>
        <Link to="/signup">
          <Button size="lg" className="mt-7 rounded-2xl h-14 px-8 bg-sky-600 hover:bg-sky-700 shadow-md" data-testid="cta-get-started-btn">
            Get Started <ArrowRight className="w-5 h-5 ml-1" />
          </Button>
        </Link>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-10">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="max-w-sm">
              <Logo />
              <p className="mt-3 text-sm text-stone-500">Remember, organize, and share what matters — calmly.</p>
            </div>
            <div className="flex gap-10 text-sm">
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-stone-800">Product</span>
                <a href="#features" className="text-stone-500 hover:text-stone-900">Features</a>
                <Link to="/how-it-works" className="text-stone-500 hover:text-stone-900">How it works</Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-stone-800">Company</span>
                <Link to="/about" className="text-stone-500 hover:text-stone-900">About</Link>
                <Link to="/safety" className="text-stone-500 hover:text-stone-900">Safety</Link>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-stone-500 hover:text-stone-900">Contact</a>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-stone-800">Legal</span>
                {LEGAL_LINKS.map((l) => (
                  <Link key={l.to} to={l.to} className="text-stone-500 hover:text-stone-900">{l.label}</Link>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-stone-100">
            <Disclaimer />
            <p className="mt-3 text-xs text-stone-400">© {new Date().getFullYear()} MemoryMate. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
