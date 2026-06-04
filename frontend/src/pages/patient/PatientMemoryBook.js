import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { BookHeart, Loader2 } from "lucide-react";

export default function PatientMemoryBook() {
  const [entries, setEntries] = useState(null);
  useEffect(() => { api.get("/memory-book").then(({ data }) => setEntries(data)).catch(() => setEntries([])); }, []);

  if (!entries) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up" data-testid="patient-memorybook-page">
      <PatientPageHeader title="My Memory Book" subtitle="People, places and moments to remember." />

      {entries.length === 0 ? (
        <EmptyState icon={BookHeart} title="Your memory book is empty for now" testid="patient-mb-empty"
          message="Your family will add photos and stories here for you to look at anytime." />
      ) : (
        <div className="space-y-5">
          {entries.map((e) => (
            <div key={e.id} className="rounded-3xl bg-white border-2 border-stone-200 overflow-hidden shadow-sm" data-testid="patient-mb-card">
              {e.photo_url && <img src={e.photo_url} alt={e.title} className="w-full max-h-72 object-cover" />}
              <div className="p-6">
                <div className="flex items-center gap-3">
                  {!e.photo_url && <span className="grid place-items-center w-14 h-14 rounded-2xl bg-rose-100 text-rose-500 shrink-0"><BookHeart className="w-7 h-7" /></span>}
                  <div>
                    <h2 className="font-heading text-2xl font-bold">{e.title}</h2>
                    {e.relationship && <p className="text-lg text-sky-700 font-medium">{e.relationship}</p>}
                  </div>
                </div>
                {e.story && <p className="mt-4 text-lg text-stone-700 leading-relaxed">{e.story}</p>}
                {Array.isArray(e.facts) && e.facts.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-lg text-stone-700">
                    {e.facts.map((f, i) => <li key={`fact-${i}`} className="flex items-start gap-2"><span className="text-stone-300 mt-1">•</span> {f}</li>)}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 text-center">
        <Link to="/patient" className="text-sky-700 font-medium" data-testid="mb-back-home">← Back to home</Link>
      </div>
    </div>
  );
}
