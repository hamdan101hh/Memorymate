import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { PatientPageHeader } from "./PatientLayout";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/common";
import { Bell, CalendarClock, BookHeart, Trash2, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import PhotoAttachmentPicker from "../../components/PhotoAttachmentPicker";

export default function SmartDayDrafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const [usage, setUsage] = useState(null);
  const [busy, setBusy] = useState(null);
  const [draftImages, setDraftImages] = useState({});
  const [photoPermission, setPhotoPermission] = useState({});

  const load = useCallback(() => {
    api.get("/capture/smart-day/drafts").then(({ data }) => setDrafts(data.drafts || []));
    api.get("/usage/today").then(({ data }) => setUsage(data));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (id, saveAs) => {
    const images = draftImages[id] || [];
    const imageIds = images.map((i) => i.id);
    if (imageIds.length && !photoPermission[id]) {
      toast.error("Please confirm you have permission to save attached photos.");
      return;
    }
    setBusy(id);
    try {
      await api.post(`/capture/smart-day/drafts/${id}/save`, {
        save_as: saveAs,
        image_ids: imageIds,
        permission_confirmed: imageIds.length ? true : false,
      });
      toast.success(`Saved as ${saveAs}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const ignore = async (id) => {
    setBusy(id);
    try {
      await api.post(`/capture/smart-day/drafts/${id}/ignore`);
      load();
    } catch {
      toast.error("Could not delete draft");
    } finally {
      setBusy(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Delete all Smart Day drafts?")) return;
    await api.post("/capture/smart-day/drafts/clear");
    toast.success("Drafts cleared");
    load();
  };

  return (
    <div className="mm-fade-up" data-testid="smart-day-drafts-page">
      <PatientPageHeader
        title="Smart Day Capture drafts"
        subtitle="Review before saving. Nothing is saved automatically."
      />

      {usage && (
        <p className="text-sm text-stone-600 mb-4" data-testid="cloud-voice-usage">
          Cloud voice used today: {usage.smart_day_cloud_minutes ?? 0} / {usage.smart_day_cloud_cap_minutes ?? 15} minutes
        </p>
      )}

      <p className="text-sm text-stone-500 mb-4" data-testid="smart-day-web-note">
        Smart Day Capture works while the page is open. Mobile app background capture will require app-store permissions later.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <Button variant="outline" onClick={clearAll} className="rounded-xl" data-testid="clear-all-drafts-btn">
          <Trash2 className="w-4 h-4 mr-1" /> Delete all drafts
        </Button>
        <Button variant="outline" onClick={() => navigate("/patient")} className="rounded-xl">Back to home</Button>
      </div>

      {drafts.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No drafts yet" testid="smart-day-drafts-empty"
          message="Meaningful speech snippets appear here for review. Short noise and silence are ignored." />
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <div key={d.id} className="rounded-2xl border-2 border-stone-200 bg-white p-5" data-testid="smart-day-draft-card">
              <p className="font-semibold text-lg">{d.suggested_title}</p>
              <p className="text-sm text-stone-500 mt-1">{d.suggested_type} · {d.confidence} confidence</p>
              <p className="mt-2 text-stone-700">{d.suggested_summary || d.transcript}</p>
              <p className="text-xs text-stone-400 mt-2">Detected {new Date(d.detected_at || d.created_at).toLocaleString()}</p>
              <div className="mt-4">
                <PhotoAttachmentPicker
                  linkedType="smart_day_draft"
                  linkedId={d.id}
                  compact
                  onImagesChange={(imgs) => setDraftImages((prev) => ({ ...prev, [d.id]: imgs }))}
                  sectionTitle="Add photo"
                  sectionSubtitle="Photo added for context before saving."
                />
                {(draftImages[d.id]?.length > 0) && (
                  <label className="mt-2 flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={photoPermission[d.id] || false}
                      onChange={(e) => setPhotoPermission((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                      data-testid={`smart-day-photo-perm-${d.id}`}
                    />
                    Save photo with this draft
                  </label>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === d.id} onClick={() => save(d.id, "memory")} className="rounded-xl bg-emerald-600" data-testid="save-draft-memory">
                  <BookHeart className="w-4 h-4 mr-1" /> Save as memory
                </Button>
                <Button size="sm" disabled={busy === d.id} onClick={() => save(d.id, "reminder")} variant="outline" className="rounded-xl" data-testid="save-draft-reminder">
                  <Bell className="w-4 h-4 mr-1" /> Save as reminder
                </Button>
                <Button size="sm" disabled={busy === d.id} onClick={() => save(d.id, "appointment")} variant="outline" className="rounded-xl" data-testid="save-draft-appointment">
                  <CalendarClock className="w-4 h-4 mr-1" /> Save as appointment
                </Button>
                <Button size="sm" disabled={busy === d.id} onClick={() => ignore(d.id)} variant="ghost" className="rounded-xl" data-testid="ignore-draft">
                  Delete draft
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
