import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { EmptyState } from "../../components/common";
import { MapPin, Home, Cross, Pill, Loader2 } from "lucide-react";

const TYPE_ICON = { home: Home, clinic: Cross, hospital: Cross, pharmacy: Pill };

export default function PatientPlaces() {
  const [places, setPlaces] = useState(null);
  useEffect(() => { api.get("/places").then(({ data }) => setPlaces(data)); }, []);

  if (!places) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up" data-testid="patient-places-page">
      <PatientPageHeader title="Important Places" subtitle="Familiar places you may visit." />
      {places.length === 0 ? (
        <EmptyState icon={MapPin} title="No places added yet" testid="places-empty"
          message="Your caregiver can add familiar places like home, the clinic or the pharmacy." />
      ) : (
        <div className="space-y-4">
          {places.map((p) => {
            const Icon = TYPE_ICON[p.type] || MapPin;
            return (
              <div key={p.id} className="rounded-3xl bg-white border-2 border-stone-200 p-6 flex items-start gap-4" data-testid="place-card">
                <span className="grid place-items-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 shrink-0"><Icon className="w-7 h-7" /></span>
                <div>
                  <h3 className="font-heading text-xl font-bold">{p.name}</h3>
                  {p.description && <p className="text-lg text-stone-600 mt-1">{p.description}</p>}
                  {p.instructions && <p className="text-stone-500 mt-1">{p.instructions}</p>}
                  {p.address && <p className="text-sm text-stone-400 mt-1">{p.address}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
