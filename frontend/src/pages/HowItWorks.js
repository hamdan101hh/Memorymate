import { Link } from "react-router-dom";
import { Logo, Disclaimer, LegalLinks } from "../components/common";
import { Button } from "../components/ui/button";
import {
  Mic, Keyboard, StickyNote, CalendarClock, MessageSquare, Smartphone, Filter,
  Sparkles, ShieldQuestion, Database, LayoutDashboard, Home, ArrowRight, ArrowDown,
  Lock, LockKeyhole, Check, X, Bell, Pill, Users, MapPin, BookHeart, HeartHandshake,
  ShieldCheck, EyeOff, Gauge, Wallet, WifiOff, Download, Share2, Phone, Sun, Coffee,
  Moon, Cpu, ArrowDownToLine, Info, ListChecks, Settings2, RefreshCw,
} from "lucide-react";

/* ===========================================================================
   How MemoryMate Works — in-app visual walkthrough
   Public, standalone page (works for patients, caregivers, investors, devs).
   ======================================================================== */

function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-stone-50/85 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
          <a href="#promise" className="hover:text-stone-900 transition-colors">The promise</a>
          <a href="#pipeline" className="hover:text-stone-900 transition-colors">How capture works</a>
          <a href="#privacy" className="hover:text-stone-900 transition-colors">Privacy</a>
          <a href="#architecture" className="hover:text-stone-900 transition-colors">Architecture</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login"><Button variant="ghost" className="rounded-xl">Log in</Button></Link>
          <Link to="/signup"><Button className="rounded-xl bg-sky-600 hover:bg-sky-700">Get Started</Button></Link>
        </div>
      </div>
    </header>
  );
}

function Section({ id, eyebrow, title, intro, children, alt }) {
  return (
    <section id={id} className={alt ? "bg-white border-y border-stone-200" : ""}>
      <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
        {eyebrow && <p className="text-sm font-semibold text-sky-700 uppercase tracking-wide">{eyebrow}</p>}
        {title && <h2 className="mt-2 font-heading text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>}
        {intro && <p className="mt-3 text-stone-600 text-lg max-w-3xl leading-relaxed">{intro}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

// A soft pill node used in flows / diagrams.
function Node({ icon: Icon, label, tone = "stone" }) {
  const tones = {
    stone: "bg-white border-stone-200 text-stone-700",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
  };
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium ${tones[tone]}`}>
      <Icon className="w-4 h-4 shrink-0" /> <span>{label}</span>
    </div>
  );
}

const Arrow = () => <ArrowRight className="w-5 h-5 text-stone-300 shrink-0 hidden md:block" />;
const ArrowV = () => <ArrowDown className="w-5 h-5 text-stone-300 mx-auto md:hidden" />;

// ---- data --------------------------------------------------------------
const PATIENT = [
  { icon: Mic, t: "Record a Memory" }, { icon: Sun, t: "Today's Summary" },
  { icon: MessageSquare, t: "Ask My Assistant" }, { icon: Bell, t: "Reminders" },
  { icon: Users, t: "Important People" }, { icon: BookHeart, t: "Memory Book" },
  { icon: RefreshCw, t: "Start / Pause Capture" }, { icon: Phone, t: "Emergency Contact" },
];
const CAREGIVER = [
  { icon: LayoutDashboard, t: "Dashboard & overview" }, { icon: Gauge, t: "Capture status" },
  { icon: CalendarClock, t: "Timeline & appointments" }, { icon: Bell, t: "Reminders" },
  { icon: Pill, t: "Medication notes" }, { icon: MapPin, t: "People & places" },
  { icon: ShieldQuestion, t: "Privacy Review & alerts" }, { icon: BookHeart, t: "Memory Book" },
  { icon: HeartHandshake, t: "Family Circle" }, { icon: Sparkles, t: "AI caregiver summary" },
  { icon: Share2, t: "Share / export" },
];

const STEPS = [
  { n: 1, icon: ShieldCheck, t: "Consent & setup", tone: "sky",
    d: "Choose how long capture runs (1 day, 1 week, 1 month, until you turn it off, or custom), allow the microphone, and pick your note style & reminder tone. A clear status shows whenever capture is on." },
  { n: 2, icon: Gauge, t: "Smart background capture", tone: "emerald",
    d: "With permission, MemoryMate notices useful events — speech, wake/sleep signals, calendar events, manual captures, WhatsApp messages, caregiver notes. Event-based, not full raw storage." },
  { n: 3, icon: Smartphone, t: "On-device transcription", tone: "sky",
    d: "Speech becomes text on the device where possible. Raw audio isn't uploaded and is discarded immediately by default." },
  { n: 4, icon: Filter, t: "Filter the noise", tone: "amber",
    d: "Silence, background noise and unimportant small talk are dropped. Only useful chunks move forward." },
  { n: 5, icon: Sparkles, t: "AI extraction", tone: "violet",
    d: "A model pulls out structured items: memory summary, reminder, appointment, medication note, person, place, task, family note — and flags anything sensitive or uncertain." },
  { n: 6, icon: ShieldQuestion, t: "Privacy routing", tone: "amber",
    d: "Items are routed to the right home: timeline, reminders, appointments, medication, people, places, Memory Book — or held in Privacy Review / the Private Vault." },
  { n: 7, icon: Database, t: "Save useful memory", tone: "emerald",
    d: "Only tidy summaries and structured objects are saved. No full raw audio by default; transcripts are optional and off by default." },
];

const REVIEW_ACTIONS = [
  "Approve & save", "Edit then save", "Convert to reminder",
  "Mark as private", "Add to Private Vault", "Delete",
];
const SENSITIVE = [
  "Medication changes", "Doctor advice", "Financial information", "Family conflict",
  "Addresses", "Passwords", "Personal/private conversations", "Unclear AI guesses",
];

const STORED = ["Memory summaries", "Reminders", "Appointments", "People", "Places", "Approved caregiver notes", "Approved Memory Book items"];
const OPTIONAL = ["Full transcript", "Raw audio clip", "Location history", "WhatsApp message history", "Export history"];
const NEVER = ["All-day raw audio", "Random background noise", "Small talk", "Sensitive items before approval", "Deleted capture data", "Password-like content"];

const NOTE_STYLES = ["Very short & simple", "Warm & gentle", "Detailed summary", "Bullet points", "Family-friendly update", "Caregiver-style report"];
const TONES = [
  { t: "Gentle", ex: "“It may be time to take your medicine.”" },
  { t: "Direct", ex: "“Take your medicine at 8 PM.”" },
  { t: "Family tone", ex: "“Your family wanted to remind you about your medicine.”" },
  { t: "Custom", ex: "Your own wording." },
];

const APPROVED = [
  "“I found this in your memories.”", "“Your notes say…”", "“I don't have that saved yet.”",
  "“Would you like me to ask your caregiver?”", "“Your saved reminder says…”",
];
const AVOID = ["“You forgot.”", "“You should take this medicine.”", "“I think your doctor said…”", "“You definitely met this person.”"];

const INPUTS = [
  { icon: Mic, t: "Manual voice note" }, { icon: Keyboard, t: "Typed memory" },
  { icon: StickyNote, t: "Caregiver note" }, { icon: MessageSquare, t: "WhatsApp inbound" },
  { icon: CalendarClock, t: "Calendar event" }, { icon: Phone, t: "Emergency contact update" },
];
const OUTPUTS = [
  { icon: Bell, t: "Push notification" }, { icon: MessageSquare, t: "WhatsApp update" },
  { icon: Phone, t: "SMS urgent fallback" }, { icon: Download, t: "Email summary" },
  { icon: Download, t: "PDF export" }, { icon: CalendarClock, t: "Google Calendar event" },
];
const BUILD_ORDER = ["Push notifications", "Google Calendar", "WhatsApp", "SMS urgent fallback", "Email / PDF exports"];

const ROLES = [
  { r: "Patient", see: "Own memories, reminders, people, Memory Book, today's summary", can: "Record memories, start/pause/stop capture, ask the assistant, use emergency contact" },
  { r: "Main caregiver", see: "Everything for their linked patient + dashboard, timeline, alerts", can: "Manage reminders, review privacy items, manage Memory Book, invite Family Circle, export if allowed" },
  { r: "Family Circle", see: "Selected memories shared with them", can: "Add photos/stories, receive limited updates — no full access unless approved" },
  { r: "Emergency contact", see: "Emergency info and alerts only", can: "Be reached in an emergency" },
  { r: "Admin", see: "System users, collections, audit logs", can: "Technical support only — no private data access by default" },
];

const STATUS_PILL = {
  Live: "bg-emerald-100 text-emerald-700",
  Planned: "bg-stone-100 text-stone-500",
};

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" data-testid="how-it-works-page">
      <Nav />

      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-stone-50 to-stone-50" />
        <div className="relative max-w-6xl mx-auto px-5 pt-14 pb-12 md:pt-20">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 bg-sky-100 px-3 py-1.5 rounded-full">
            <HeartHandshake className="w-4 h-4" /> A loving family assistant — not a surveillance tool
          </span>
          <h1 className="mt-5 font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] max-w-4xl">
            How MemoryMate works
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-stone-600 leading-relaxed max-w-2xl">
            A privacy-first daily-life memory support app. It captures useful daily moments
            <span className="font-semibold text-stone-800"> with permission</span>, turns them into reminders and gentle
            summaries, and helps families stay informed — <span className="font-semibold text-stone-800">without storing every word.</span>
          </p>

          <div className="mt-7 grid sm:grid-cols-2 gap-3 max-w-3xl">
            <div className="rounded-2xl bg-white border border-stone-200 p-4 flex gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm text-stone-600"><b className="text-stone-800">Not a medical tool.</b> MemoryMate is a daily-life memory support tool. It is not a medical diagnosis or treatment tool.</p>
            </div>
            <div className="rounded-2xl bg-white border border-stone-200 p-4 flex gap-3">
              <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
              <p className="text-sm text-stone-600"><b className="text-stone-800">Capture is transparent.</b> Everyone involved in conversations should be aware when capture is on.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {["Consent-based capture", "Useful moments only", "Always available, not always storing", "Privacy-first"].map((t) => (
              <span key={t} className="text-xs font-medium text-stone-600 bg-stone-100 border border-stone-200 rounded-full px-3 py-1">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 1. CORE PROMISE ---------- */}
      <Section id="promise" eyebrow="The core promise" title="It never saves every word"
        intro="MemoryMate transcribes on the device where possible, filters out noise and small talk, keeps only useful memory items, and sends sensitive or uncertain items to Privacy Review before anything is saved." alt>
        <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-2 flex-wrap">
            <div className="flex flex-col gap-2">
              <Node icon={Mic} label="Voice / typed memory" tone="sky" />
              <Node icon={StickyNote} label="Caregiver note" tone="sky" />
              <Node icon={MessageSquare} label="Calendar / WhatsApp" tone="sky" />
            </div>
            <ArrowV /><Arrow />
            <Node icon={Smartphone} label="On-device transcription / input" tone="stone" />
            <ArrowV /><Arrow />
            <Node icon={Filter} label="Noise & small-talk filter" tone="amber" />
            <ArrowV /><Arrow />
            <Node icon={Sparkles} label="AI extraction" tone="violet" />
            <ArrowV /><Arrow />
            <Node icon={ShieldQuestion} label="Privacy Review" tone="amber" />
            <ArrowV /><Arrow />
            <Node icon={Database} label="Saved memory objects" tone="emerald" />
            <ArrowV /><Arrow />
            <div className="flex flex-col gap-2">
              <Node icon={Home} label="Patient app" tone="emerald" />
              <Node icon={LayoutDashboard} label="Caregiver dashboard" tone="emerald" />
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- 2. TWO SIDES ---------- */}
      <Section eyebrow="Two sides, one shared memory" title="Built for the person — and the family caring for them"
        intro="Both sides read and write the same trusted memory database, so everyone stays in sync.">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border-2 border-sky-200 bg-sky-50/40 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-sky-600 text-white"><Home className="w-6 h-6" /></span>
              <div><h3 className="font-heading text-xl font-bold">Patient side</h3><p className="text-sm text-stone-500">Large buttons, gentle wording, no jargon.</p></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {PATIENT.map((i) => (
                <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-white border border-stone-200 px-3 py-2.5 text-sm font-medium">
                  <i.icon className="w-4 h-4 text-sky-600 shrink-0" /> {i.t}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border-2 border-emerald-200 bg-emerald-50/40 p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-emerald-600 text-white"><LayoutDashboard className="w-6 h-6" /></span>
              <div><h3 className="font-heading text-xl font-bold">Caregiver side</h3><p className="text-sm text-stone-500">A full, calm dashboard over the same data.</p></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {CAREGIVER.map((i) => (
                <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-white border border-stone-200 px-3 py-2.5 text-sm font-medium">
                  <i.icon className="w-4 h-4 text-emerald-600 shrink-0" /> {i.t}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-3 text-sm text-stone-500">
          <Database className="w-5 h-5 text-stone-400" /> One shared, trusted memory database — role-based and private by design.
        </div>
      </Section>

      {/* ---------- 3. PIPELINE ---------- */}
      <Section id="pipeline" eyebrow="From spoken moment to saved memory" title="The capture pipeline, step by step"
        intro="What happens between someone talking and a clean, gentle note appearing." alt>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-6 hover:border-sky-300 hover:shadow-sm transition-all">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-stone-900 text-white font-heading font-bold">{s.n}</span>
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-stone-100 text-stone-600"><s.icon className="w-5 h-5" /></span>
              </div>
              <h3 className="mt-4 font-heading font-semibold text-lg">{s.t}</h3>
              <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">{s.d}</p>
            </div>
          ))}
          {/* Worked example fills the last grid cell */}
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/50 p-6">
            <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Worked example</p>
            <p className="mt-2 text-sm text-stone-700"><b>Heard:</b> “Tomorrow we have your dentist appointment at 4 PM. I'll pick you up after lunch.”</p>
            <p className="mt-2 text-sm text-stone-700"><b>Saved:</b> “You have a dentist appointment tomorrow at 4 PM. Someone will pick you up after lunch.”</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2"><CalendarClock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Appointment: Dentist tomorrow, 4 PM</div>
              <div className="flex gap-2"><Bell className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" /> Reminder: Get ready after lunch</div>
              <div className="flex gap-2"><Users className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" /> Person: pickup person (if known)</div>
              <div className="flex gap-2"><Check className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" /> Privacy: not sensitive</div>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- 4. PRIVACY REVIEW ---------- */}
      <Section id="privacy" eyebrow="Privacy Review" title="Sensitive or uncertain? It waits for a human."
        intro="Anything private, medical, financial, or unclear is never auto-saved to the normal timeline. It pauses in Privacy Review until someone decides.">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><ListChecks className="w-5 h-5 text-amber-500" /> What you can do with each item</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {REVIEW_ACTIONS.map((a) => (
                <div key={a} className="flex items-center gap-2 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" /> {a}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><ShieldQuestion className="w-5 h-5 text-amber-500" /> Examples held for review</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {SENSITIVE.map((s) => (
                <span key={s} className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">{s}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-stone-900 text-white p-5 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 shrink-0" />
          <p className="font-medium">If the AI is unsure, it asks for review instead of guessing.</p>
        </div>
      </Section>

      {/* ---------- 5. PRIVATE VAULT ---------- */}
      <Section eyebrow="Private Vault" title="A locked space for the most sensitive memories" alt>
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          <div className="rounded-3xl bg-stone-900 text-white p-7">
            <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white/10"><LockKeyhole className="w-7 h-7" /></span>
            <h3 className="mt-5 font-heading text-2xl font-bold">Private Vault</h3>
            <div className="mt-4 space-y-2.5 text-stone-200 text-sm">
              {[
                [Lock, "PIN locked — biometric unlock supported where available"],
                [EyeOff, "Hidden from the normal timeline"],
                [Share2, "Hidden from exports unless explicitly selected"],
                [ShieldCheck, "Shows elsewhere only as “Private item locked”"],
              ].map(([Ic, t]) => (
                <div key={t} className="flex gap-2.5"><Ic className="w-4 h-4 shrink-0 mt-0.5 text-sky-200" /> {t}</div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-7">
            <h3 className="font-heading font-semibold text-lg">What it can store</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {["Sensitive medical notes", "Important documents", "Financial details", "Emergency instructions", "Family-only memories", "Private caregiver notes"].map((t) => (
                <div key={t} className="flex items-center gap-2.5 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium">
                  <Lock className="w-4 h-4 text-stone-500 shrink-0" /> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- 6. STORED VS NEVER ---------- */}
      <Section eyebrow="Data minimization" title="What's stored — and what never is">
        <div className="grid md:grid-cols-3 gap-5">
          <ColumnList title="Stored by default" items={STORED} tone="emerald" icon={Check} />
          <ColumnList title="Optional (off by default)" items={OPTIONAL} tone="amber" icon={Settings2} />
          <ColumnList title="Never stored by default" items={NEVER} tone="rose" icon={X} />
        </div>
      </Section>

      {/* ---------- 7. SMART BUT CHEAP ---------- */}
      <Section eyebrow="Smart AI without exploding costs" title="Powerful where it matters, cheap everywhere else"
        intro="A tiered design keeps quality high and cost predictable." alt>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Smartphone, t: "On-device", c: "text-emerald-700 bg-emerald-50 border-emerald-200", d: "Transcription runs on the device where possible — the highest-volume work is free." },
            { icon: Cpu, t: "Cheap model", c: "text-sky-700 bg-sky-50 border-sky-200", d: "High-volume extraction and summaries use a low-cost model." },
            { icon: Sparkles, t: "Premium model", c: "text-violet-700 bg-violet-50 border-violet-200", d: "Reserved for Ask My Assistant, caregiver reports, complex summaries and sensitive-review explanations." },
          ].map((x) => (
            <div key={x.t} className={`rounded-2xl border p-6 ${x.c}`}>
              <x.icon className="w-7 h-7" />
              <h3 className="mt-3 font-heading font-semibold text-lg text-stone-900">{x.t}</h3>
              <p className="mt-1.5 text-sm text-stone-600">{x.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-2 flex-wrap">
            <Node icon={Gauge} label="Local detection" tone="emerald" /><ArrowV /><Arrow />
            <Node icon={Smartphone} label="Local transcription" tone="emerald" /><ArrowV /><Arrow />
            <Node icon={Cpu} label="Cheap AI extraction" tone="sky" /><ArrowV /><Arrow />
            <Node icon={Sparkles} label="Premium AI only when needed" tone="violet" /><ArrowV /><Arrow />
            <Node icon={Wallet} label="Daily cost cap" tone="amber" /><ArrowV /><Arrow />
            <Node icon={ArrowDownToLine} label="Graceful fallback" tone="stone" />
          </div>
          <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
            <Wallet className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              <b>Hard daily AI cost cap per user (default $0.50/day).</b> If a day reaches the cap, the app keeps capturing
              locally where possible and processes summaries later — it never allows unlimited AI spending.
            </p>
          </div>
        </div>
      </Section>

      {/* ---------- 8. PERSONALIZATION ---------- */}
      <Section eyebrow="Personalization" title="Written the way the family wants to hear it"
        intro="Chosen once during setup, applied everywhere: memory summaries, reminders, the assistant, caregiver reports and shared messages.">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg">How should notes be written?</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {NOTE_STYLES.map((s) => (
                <div key={s} className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium">{s}</div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg">How should reminders sound?</h3>
            <div className="mt-4 space-y-2.5">
              {TONES.map((t) => (
                <div key={t.t} className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
                  <p className="text-sm font-semibold">{t.t}</p>
                  <p className="text-sm text-stone-500">{t.ex}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- 9. ASSISTANT SAFETY ---------- */}
      <Section eyebrow="Assistant safety rules" title="The assistant only speaks from saved data"
        intro="It never invents people, appointments or medication instructions, never diagnoses, and never says “you forgot.”" alt>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border-2 border-emerald-200 bg-emerald-50/40 p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2 text-emerald-800"><Check className="w-5 h-5" /> Approved phrases</h3>
            <div className="mt-4 space-y-2.5">
              {APPROVED.map((p) => (
                <div key={p} className="rounded-xl bg-white border border-emerald-200 px-3 py-2.5 text-sm">{p}</div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border-2 border-rose-200 bg-rose-50/40 p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2 text-rose-800"><X className="w-5 h-5" /> Phrases to avoid</h3>
            <div className="mt-4 space-y-2.5">
              {AVOID.map((p) => (
                <div key={p} className="rounded-xl bg-white border border-rose-200 px-3 py-2.5 text-sm text-stone-500 line-through">{p}</div>
              ))}
            </div>
            <p className="mt-4 text-sm text-stone-600">For medical uncertainty it suggests asking a caregiver or doctor; for medication it only repeats approved, saved reminders.</p>
          </div>
        </div>
      </Section>

      {/* ---------- 10. CONNECTORS ---------- */}
      <Section eyebrow="Connectors & sharing" title="How memories come in — and updates go out">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-sky-600" /> Inputs</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {INPUTS.map((i) => (
                <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium"><i.icon className="w-4 h-4 text-sky-600 shrink-0" /> {i.t}</div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-6">
            <h3 className="font-heading font-semibold text-lg flex items-center gap-2"><Share2 className="w-5 h-5 text-emerald-600" /> Outputs</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-2.5">
              {OUTPUTS.map((i) => (
                <div key={i.t} className="flex items-center gap-2.5 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium"><i.icon className="w-4 h-4 text-emerald-600 shrink-0" /> {i.t}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-stone-200 bg-white p-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Recommended build order</h3>
          <div className="flex flex-col md:flex-row md:items-center gap-2 flex-wrap">
            {BUILD_ORDER.map((b, i) => (
              <div key={b} className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 px-3.5 py-2.5 text-sm font-medium">
                  <span className="grid place-items-center w-5 h-5 rounded-full bg-sky-600 text-white text-xs">{i + 1}</span> {b}
                </span>
                {i < BUILD_ORDER.length - 1 && <Arrow />}
              </div>
            ))}
          </div>
          <div className="mt-5 grid md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4">
              <p className="font-semibold flex items-center gap-2"><CalendarClock className="w-4 h-4 text-stone-500" /> Google Calendar</p>
              <p className="mt-1 text-stone-600">Read events with permission and add reminders/appointments with permission. Never change events without approval.</p>
            </div>
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4">
              <p className="font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-stone-500" /> WhatsApp</p>
              <p className="mt-1 text-stone-600">For caregiver summaries and important alerts. No spam — normal reminders use push notifications first.</p>
            </div>
            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4">
              <p className="font-semibold flex items-center gap-2"><Phone className="w-4 h-4 text-stone-500" /> SMS</p>
              <p className="mt-1 text-stone-600">Urgent fallback only — missed important medicine, emergency contact, high-priority caregiver alert.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- 11. ROLES ---------- */}
      <Section eyebrow="Access & roles" title="Everyone sees only what they should" alt
        intro="Role checks are enforced on the backend with JWT and server-side permissions — not just hidden in the UI.">
        <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="p-4 font-semibold">Role</th>
                <th className="p-4 font-semibold">Can see</th>
                <th className="p-4 font-semibold">Can do</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.r} className="border-b border-stone-100 last:border-0 align-top">
                  <td className="p-4 font-semibold whitespace-nowrap">{r.r}</td>
                  <td className="p-4 text-stone-600">{r.see}</td>
                  <td className="p-4 text-stone-600">{r.can}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---------- 12. OFFLINE / PWA ---------- */}
      <Section eyebrow="Works like a phone app" title="Offline-friendly & installable">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            [Smartphone, "Installs as a PWA", "Add MemoryMate to the home screen like a native app."],
            [WifiOff, "Offline shell", "The app opens and works with a basic offline shell."],
            [Mic, "Capture offline", "Manual memory capture works offline where possible."],
            [RefreshCw, "Syncs later", "Data syncs safely when the internet returns."],
            [Bell, "Local reminders", "Reminders still fire locally where possible."],
            [ShieldQuestion, "Safe review sync", "Privacy Review syncs later, never skipping consent."],
          ].map(([Ic, t, d]) => (
            <div key={t} className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-sky-50 text-sky-700"><Ic className="w-5 h-5" /></span>
              <h3 className="mt-3 font-heading font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-stone-600">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- 14. ARCHITECTURE DIAGRAM ---------- */}
      <Section id="architecture" eyebrow="Architecture at a glance" title="Inputs → Processing → Storage → Outputs" alt
        intro="The same trusted flow, drawn out for developers and investors.">
        <div className="grid lg:grid-cols-4 gap-4">
          <DiagramColumn title="Inputs" tone="sky" items={["Voice", "Typed memory", "Caregiver note", "Calendar", "WhatsApp"]} />
          <DiagramColumn title="Processing" tone="violet" items={["Consent check", "Event detection", "On-device transcription", "Noise filter", "AI extraction", "Sensitivity detection", "Privacy Review"]} />
          <DiagramColumn title="Storage" tone="emerald" items={["Memories", "Reminders", "Appointments", "Medication notes", "People", "Places", "Memory Book", "Private Vault"]} />
          <DiagramColumn title="Outputs" tone="amber" items={["Patient Today screen", "Ask My Assistant", "Caregiver Dashboard", "Push notifications", "Google Calendar", "WhatsApp updates", "PDF / email export", "SMS urgent fallback"]} />
        </div>
        <p className="mt-4 text-sm text-stone-500 flex items-center gap-2">
          <ArrowRight className="w-4 h-4" /> Each column feeds the next; consent is checked before anything is processed, and sensitive data is gated before storage.
        </p>
      </Section>

      {/* ---------- 15. USER JOURNEY ---------- */}
      <Section eyebrow="A day with MemoryMate" title="One simple journey">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Sun, c: "bg-amber-50 border-amber-200 text-amber-700", t: "Morning", items: ["Patient wakes up", "MemoryMate shows today's plan", "Medicine reminder appears gently"] },
            { icon: Coffee, c: "bg-sky-50 border-sky-200 text-sky-700", t: "Afternoon", items: ["A conversation happens", "The app detects useful speech", "It summarizes an appointment/reminder", "An uncertain item goes to Privacy Review"] },
            { icon: Moon, c: "bg-violet-50 border-violet-200 text-violet-700", t: "Evening", items: ["Caregiver gets a daily summary", "Patient sees a gentle recap", "App suggests a Memory Book photo or story"] },
          ].map((d) => (
            <div key={d.t} className="rounded-3xl border border-stone-200 bg-white p-6">
              <span className={`grid place-items-center w-12 h-12 rounded-2xl border ${d.c}`}><d.icon className="w-6 h-6" /></span>
              <h3 className="mt-4 font-heading text-xl font-bold">{d.t}</h3>
              <div className="mt-3 space-y-2.5">
                {d.items.map((it) => (
                  <div key={it} className="flex gap-2 text-sm text-stone-600"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> {it}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- CTA + FOOTER ---------- */}
      <section className="bg-stone-900 text-white">
        <div className="max-w-4xl mx-auto px-5 py-16 text-center">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white/10 mx-auto"><HeartHandshake className="w-7 h-7" /></span>
          <h2 className="mt-6 font-heading text-3xl sm:text-4xl font-bold">A loving family assistant — built on consent.</h2>
          <p className="mt-4 text-stone-300 leading-relaxed max-w-2xl mx-auto">
            Privacy, consent, simplicity and caregiver peace of mind come first. MemoryMate is always available — but it is
            not always storing.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/signup"><Button size="lg" className="rounded-2xl h-13 px-8 bg-sky-600 hover:bg-sky-700">Get Started <ArrowRight className="w-5 h-5 ml-1" /></Button></Link>
            <Link to="/"><Button size="lg" variant="outline" className="rounded-2xl h-13 px-8 border-white/30 bg-transparent text-white hover:bg-white/10">Back to home</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-10">
          <Logo />
          <div className="mt-4 rounded-2xl bg-stone-50 border border-stone-200 p-4 space-y-1.5">
            <p className="text-sm font-medium text-stone-700">MemoryMate is a daily-life memory support and caregiver coordination tool. It is not a medical diagnosis, treatment, or emergency service. Memory Capture is consent-based and can be paused or stopped at any time.</p>
            <p className="text-sm text-stone-600">Everyone involved in conversations should be aware when capture is on.</p>
          </div>
          <div className="mt-4"><LegalLinks /></div>
          <div className="mt-4"><Disclaimer /></div>
          <p className="mt-3 text-xs text-stone-400">© {new Date().getFullYear()} MemoryMate. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function ColumnList({ title, items, tone, icon: Icon }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50/40", amber: "border-amber-200 bg-amber-50/40", rose: "border-rose-200 bg-rose-50/40",
  };
  const ic = { emerald: "text-emerald-600", amber: "text-amber-600", rose: "text-rose-600" };
  return (
    <div className={`rounded-3xl border-2 p-6 ${tones[tone]}`}>
      <h3 className="font-heading font-semibold text-lg">{title}</h3>
      <div className="mt-4 space-y-2">
        {items.map((i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-xl bg-white border border-stone-200 px-3 py-2.5 text-sm font-medium">
            <Icon className={`w-4 h-4 shrink-0 ${ic[tone]}`} /> {i}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagramColumn({ title, tone, items }) {
  const head = {
    sky: "bg-sky-600", violet: "bg-violet-600", emerald: "bg-emerald-600", amber: "bg-amber-500",
  };
  return (
    <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden">
      <div className={`${head[tone]} text-white px-5 py-3 font-heading font-semibold`}>{title}</div>
      <div className="p-4 space-y-2">
        {items.map((i) => (
          <div key={i} className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-700">{i}</div>
        ))}
      </div>
    </div>
  );
}
