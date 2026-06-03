import { Link } from "react-router-dom";
import { Logo, Disclaimer } from "../../components/common";
import { Button } from "../../components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PublicShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo />
          <Link to="/"><Button variant="ghost" size="sm" className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-1" /> Home</Button></Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-12">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-lg text-stone-600">{subtitle}</p>}
        <div className="mt-8 prose-stone space-y-5 text-stone-700 leading-relaxed">{children}</div>
        <div className="mt-12 pt-6 border-t border-stone-200"><Disclaimer /></div>
      </main>
    </div>
  );
}

export function H2({ children }) {
  return <h2 className="font-heading text-2xl font-bold text-stone-900 mt-8">{children}</h2>;
}
