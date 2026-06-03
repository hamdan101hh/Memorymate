import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Users, HelpCircle, Phone, Loader2, X } from "lucide-react";

export default function PatientPeople() {
  const [people, setPeople] = useState(null);
  const [explain, setExplain] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => { api.get("/people").then(({ data }) => setPeople(data)); }, []);

  const whoIs = async (p) => {
    setLoadingId(p.id);
    setExplain({ name: p.name, text: null });
    try {
      const { data } = await api.post(`/people/${p.id}/explain`);
      setExplain({ name: p.name, text: data.explanation });
    } catch {
      setExplain({ name: p.name, text: `${p.name} is your ${p.relationship || "loved one"}.` });
    } finally { setLoadingId(null); }
  };

  if (!people) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up" data-testid="patient-people-page">
      <PatientPageHeader title="Important People" subtitle="The people who care about you." />

      {people.length === 0 ? (
        <EmptyState icon={Users} title="No important people added yet" testid="people-empty"
          message="Your caregiver can add family members to help you recognize them." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          {people.map((p) => (
            <div key={p.id} className="rounded-3xl bg-white border-2 border-stone-200 p-6 text-center" data-testid="person-card">
              <div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-sky-100 grid place-items-center">
                {p.photo_url ? <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" /> :
                  <span className="font-heading text-3xl font-bold text-sky-600">{p.name?.[0]}</span>}
              </div>
              <h3 className="mt-4 font-heading text-2xl font-bold">{p.name}</h3>
              <p className="text-stone-500 text-lg">{p.relationship}</p>
              {p.description && <p className="mt-2 text-stone-600">{p.description}</p>}
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={() => whoIs(p)} disabled={loadingId === p.id} variant="outline" className="rounded-xl h-12 text-base" data-testid="who-is-this-btn">
                  {loadingId === p.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><HelpCircle className="w-5 h-5 mr-1" /> Who is this?</>}
                </Button>
                {p.phone && (
                  <a href={`tel:${p.phone}`}><Button className="w-full rounded-xl h-12 bg-emerald-600 hover:bg-emerald-700 text-base"><Phone className="w-5 h-5 mr-1" /> Call</Button></a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {explain && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center p-5 z-50" onClick={() => setExplain(null)} data-testid="explain-modal">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full text-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setExplain(null)} className="ml-auto block text-stone-400"><X className="w-6 h-6" /></button>
            <h3 className="font-heading text-2xl font-bold">{explain.name}</h3>
            {explain.text ? <p className="mt-3 text-xl text-stone-700 leading-relaxed">{explain.text}</p>
              : <Loader2 className="w-7 h-7 animate-spin text-sky-600 mx-auto mt-4" />}
            <Button onClick={() => setExplain(null)} className="mt-6 w-full h-12 rounded-xl bg-sky-600 hover:bg-sky-700">Got it</Button>
          </div>
        </div>
      )}
    </div>
  );
}
