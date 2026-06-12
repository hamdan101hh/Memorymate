import { useCallback, useEffect, useRef, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import AuthenticatedImage from "./AuthenticatedImage";

const MAX_IMAGES = 3;

export default function MemoryImageAttachments({
  captureSessionId = null,
  onImagesChange,
  imageAiEnabled = false,
  sectionTitle = "Photos",
  sectionSubtitle = "Add a photo to help MemoryMate create a better summary.",
}) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState(false);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const params = captureSessionId ? { capture_session_id: captureSessionId } : {};
      const { data } = await api.get("/memories/draft-images", { params });
      setImages(data.images || []);
      onImagesChange?.(data.images || []);
    } catch {
      /* optional on input screen */
    }
  }, [captureSessionId, onImagesChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = async (file, source) => {
    if (!file) return;
    if (!permission) {
      toast.error("Please confirm you have permission to save this photo.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", source);
      fd.append("permission_confirmed", "true");
      fd.append("use_in_summary", "true");
      if (captureSessionId) fd.append("capture_session_id", captureSessionId);
      await api.post("/memories/draft-images", fd);
      await refresh();
      toast.success("Photo attached (draft — saved when you confirm the note).");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not attach photo.");
    } finally {
      setLoading(false);
    }
  };

  const removeImage = async (id) => {
    setLoading(true);
    try {
      await api.delete(`/memories/draft-images/${id}`);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not remove photo.");
    } finally {
      setLoading(false);
    }
  };

  const patchImage = async (id, patch) => {
    try {
      await api.patch(`/memories/draft-images/${id}`, patch);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update photo.");
    }
  };

  const atMax = images.length >= MAX_IMAGES;
  const cameraSupported = typeof window !== "undefined" && "capture" in document.createElement("input");

  return (
    <div className="rounded-2xl bg-white border-2 border-stone-200 p-4 space-y-3" data-testid="memory-image-attachments">
      <div>
        <p className="font-semibold text-stone-800">{sectionTitle}</p>
        <p className="text-sm text-stone-500 mt-1">{sectionSubtitle}</p>
        <p className="text-xs text-amber-800 mt-2">
          Only add photos you have permission to save. Photos may contain private information.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
        <Checkbox
          checked={permission}
          onCheckedChange={(v) => setPermission(!!v)}
          data-testid="image-permission-checkbox"
        />
        I have permission to save this photo.
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            uploadFile(e.target.files?.[0], "camera");
            e.target.value = "";
          }}
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            uploadFile(e.target.files?.[0], "upload");
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={loading || atMax || !permission}
          onClick={() => cameraRef.current?.click()}
          data-testid="take-photo-btn"
        >
          <Camera className="w-4 h-4 mr-1" /> Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={loading || atMax || !permission}
          onClick={() => uploadRef.current?.click()}
          data-testid="upload-photo-btn"
        >
          <ImagePlus className="w-4 h-4 mr-1" /> Upload photo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          disabled={loading || atMax || !permission}
          onClick={() => uploadRef.current?.click()}
          data-testid="attach-device-btn"
        >
          Attach from device
        </Button>
      </div>
      {!cameraSupported && (
        <p className="text-xs text-stone-500">Choose a photo from your device.</p>
      )}
      <p className="text-xs text-stone-400">Max {MAX_IMAGES} images, 5MB each (JPG, PNG, WebP). Drafts expire after 24 hours if not saved.</p>

      {loading && <Loader2 className="w-5 h-5 animate-spin text-sky-600" />}

      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((img) => (
            <div key={img.id} className="border border-stone-200 rounded-xl p-3 flex gap-3" data-testid="draft-image-row">
              <AuthenticatedImage path={img.url} className="w-20 h-20 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-stone-500 truncate">{img.filename}</p>
                <Input
                  placeholder="Describe what the photo shows (optional)"
                  defaultValue={img.description || ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (img.description || "")) patchImage(img.id, { description: v });
                  }}
                  className="h-9 text-sm rounded-lg"
                  data-testid={`image-desc-${img.id}`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-lg h-8" onClick={() => patchImage(img.id, { use_in_summary: true })}>
                    Use in summary
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-lg h-8" onClick={() => patchImage(img.id, { use_in_summary: false })}>
                    Do not use in summary
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-lg h-8 text-red-600" onClick={() => removeImage(img.id)} data-testid={`remove-image-${img.id}`}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
                {!img.use_in_summary && <p className="text-xs text-stone-400">Excluded from AI summary</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!imageAiEnabled && (
        <p className="text-xs text-stone-500" data-testid="image-ai-disabled-note">
          Image AI is not enabled. You can describe the photo manually.
        </p>
      )}
    </div>
  );
}
