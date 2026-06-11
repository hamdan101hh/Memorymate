import { useState } from "react";
import api from "../../lib/api";
import { googleMapsSearchUrl, wazeSearchUrl, formatCoordsLabel } from "../../lib/mapLinks";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../ui/dialog";
import { MapPin, Navigation, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function MeetingLocationNote({ appointment, onSaved }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(appointment?.location || "");
  const [started, setStarted] = useState(appointment?.time || "");
  const [ended, setEnded] = useState("");
  const [notes, setNotes] = useState("");
  const [people, setPeople] = useState("");
  const [coords, setCoords] = useState(null);
  const [coordsPreview, setCoordsPreview] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setLocation(appointment?.location || "");
    setStarted(appointment?.time || "");
    setEnded("");
    setNotes("");
    setPeople("");
    setCoords(null);
    setCoordsPreview("");
    setConfirmed(false);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setCoordsPreview(formatCoordsLabel(latitude, longitude));
        toast.message("Preview your location below and confirm before saving");
      },
      () => toast.error("Could not read location. Enter a place name instead."),
      { timeout: 12000 },
    );
  };

  const save = async () => {
    if (!confirmed) {
      toast.error("Please confirm before saving location context");
      return;
    }
    const loc = location.trim() || coordsPreview;
    if (!loc && !notes.trim()) {
      toast.error("Add a location or notes");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/appointments/${appointment.id}/meeting-context`, {
        location_text: loc,
        started_at: started,
        ended_at: ended,
        notes: notes.trim(),
        people_present: people.trim(),
        confirmed: true,
        location_coords: coords && confirmed ? coords : null,
      });
      toast.success("Saved location context");
      setOpen(false);
      reset();
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const mapsUrl = googleMapsSearchUrl(location);
  const wazeUrl = wazeSearchUrl(location);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-lg text-xs h-8"
        onClick={() => { reset(); setOpen(true); }}
        data-testid="meeting-note-btn"
      >
        <MapPin className="w-3.5 h-3.5 mr-1" /> Add meeting note
      </Button>
      {appointment?.location && (
        <div className="flex gap-1 mt-1">
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 hover:underline" data-testid="open-maps-link">
              <ExternalLink className="w-3 h-3 inline" /> Maps
            </a>
          )}
          {wazeUrl && (
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 hover:underline" data-testid="open-waze-link">
              Waze
            </a>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Add location context</DialogTitle>
            <DialogDescription>
              Where did this happen? Saved location context — not verified attendance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Dubai Mall" className="mt-1 rounded-xl" data-testid="meeting-location-input" />
            </div>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={useCurrentLocation} data-testid="use-current-location">
              <Navigation className="w-3.5 h-3.5 mr-1" /> Use my current location
            </Button>
            {coordsPreview && (
              <p className="text-xs text-stone-600 bg-stone-50 rounded-lg p-2" data-testid="coords-preview">{coordsPreview}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Started at</Label>
                <Input type="time" value={started} onChange={(e) => setStarted(e.target.value)} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label>Ended at</Label>
                <Input type="time" value={ended} onChange={(e) => setEnded(e.target.value)} className="mt-1 rounded-xl" />
              </div>
            </div>
            <div>
              <Label>People present (optional)</Label>
              <Input value={people} onChange={(e) => setPeople(e.target.value)} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 rounded-xl" placeholder="What was discussed?" />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" data-testid="meeting-context-confirm" />
              <span>I confirm saving this location context to MemoryMate.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={save} disabled={busy || !confirmed} className="rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="meeting-context-save">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save location context"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
