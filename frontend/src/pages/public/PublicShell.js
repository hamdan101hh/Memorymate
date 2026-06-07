import { Link } from "react-router-dom";
import { Logo, Disclaimer, LegalDisclaimer, LegalLinks } from "../../components/common";
import { Button } from "../../components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PublicShell({ title, subtitle, children, updated, legalFooter = true }) {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo />
          <Link to="/"><Button variant="ghost" size="sm" className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-1" /> Home</Button></Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-12 w-full flex-1">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-lg text-stone-600">{subtitle}</p>}
        {updated && <p className="mt-2 text-sm text-stone-400">Last updated: {updated}</p>}
        <div className="mt-8 prose-stone space-y-5 text-stone-700 leading-relaxed">{children}</div>
        <div className="mt-12 pt-6 border-t border-stone-200 space-y-4">
          <LegalDisclaimer />
          <Disclaimer />
        </div>
      </main>

      {legalFooter && (
        <footer className="border-t border-stone-200 bg-white">
          <div className="max-w-3xl mx-auto px-5 py-8">
            <Logo />
            <div className="mt-4"><LegalLinks /></div>
            <p className="mt-5 text-xs text-stone-400">
              These pages are launch-readiness placeholders for transparency and are not a substitute for
              legal advice. They should be reviewed by a qualified lawyer before a full public launch.
            </p>
            <p className="mt-2 text-xs text-stone-400">© {new Date().getFullYear()} MemoryMate. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  );
}

export function H2({ children, id }) {
  return <h2 id={id} className="font-heading text-2xl font-bold text-stone-900 mt-8 scroll-mt-20">{children}</h2>;
}

export function Bullets({ items }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}
