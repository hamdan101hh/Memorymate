import { useCallback, useEffect, useRef, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import PhotoAttachmentPreview from "./PhotoAttachmentPreview";

const DEFAULT_MAX = 3;
const DEFAULT_MAX_MB = 5;

const UPLOAD_DISABLED_MESSAGE =
  "Photo uploads are not enabled in this environment yet. You can still save your note without photos.";

export default function PhotoAttachmentPicker({
  linkedType = "draft",
  linkedId = null,
  captureSessionId = null,
  onImagesChange,
  maxFiles = DEFAULT_MAX,
  maxSizeMB = DEFAULT_MAX_MB,
  allowedTypes = ["image/jpeg", "image/png", "image/webp"],
  showCameraOption = true,
  showUseInSummary = true,
  sectionTitle = "Add photo",
  sectionSubtitle = "Attach an image for context. Describe the photo manually.",
  compact = false,
}) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState(false);
  const [uploadsAvailable, setUploadsAvailable] = useState(true);
  const [uploadDisabledMessage, setUploadDisabledMessage] = useState(UPLOAD_DISABLED_MESSAGE);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/attachments/upload-config");
        if (cancelled) return;
        const available = data?.uploads_available !== false;
        setUploadsAvailable(available);
        if (!available && data?.message) {
          setUploadDisabledMessage(data.message);
        }
      } catch {
        /* keep default — upload attempt will surface backend guard */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const params = {};
      if (captureSessionId) params.capture_session_id = captureSessionId;
      else if (linkedId) {
        params.linked_type = linkedType;
        params.linked_id = linkedId;
      }
      const { data } = await api.get("/attachments/draft", { params });
      setImages(data.images || []);
      onImagesChange?.(data.images || []);
    } catch {
      /* optional */
    }
  }, [linkedType, linkedId, captureSessionId, onImagesChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = async (file, source) => {
    if (!file) return;
    if (!permission) {
      toast.error("Please confirm you have permission to save this photo.");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      toast.error("This image is too large. Please use an image under 5MB.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", source);
      fd.append("permission_confirmed", "true");
      fd.append("use_in_summary", "true");
      fd.append("linked_type", linkedType);
      if (linkedId) fd.append("linked_id", linkedId);
      if (captureSessionId) fd.append("capture_session_id", captureSessionId);
      await api.post("/attachments/draft", fd);
      await refresh();
      toast.success("Photo attached (draft — saved when you confirm).");
    } catch (err) {
      const status = err.response?.status;
      const detail = formatApiError(err.response?.data?.detail);
      if (status === 403 && detail) {
        setUploadsAvailable(false);
        setUploadDisabledMessage(detail);
      } else {
        toast.error(detail || "Could not attach photo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const removeImage = async (id) => {
    setLoading(true);
    try {
      await api.delete(`/attachments/draft/${id}`);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not remove photo.");
    } finally {
      setLoading(false);
    }
  };

  const patchImage = async (id, patch) => {
    try {
      await api.patch(`/attachments/draft/${id}`, patch);
      await refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not update photo.");
    }
  };

  const atMax = images.length >= maxFiles;
  const cameraSupported = showCameraOption && typeof window !== "undefined" && "capture" in document.createElement("input");

  if (compact && uploadsAvailable && images.length === 0 && !permission) {
    return null;
  }

  return (
    <div className={`rounded-2xl bg-white border-2 border-stone-200 p-4 space-y-3 ${compact ? "border border-stone-200" : ""}`} data-testid="photo-attachment-picker">
      {compact && !uploadsAvailable && (
        <p className="text-sm text-stone-600 bg-stone-50 border border-stone-200 rounded-xl p-3" data-testid="photo-upload-disabled-notice">
          {uploadDisabledMessage}
        </p>
      )}
      {!compact && (
        <div>
          <p className="font-semibold text-stone-800">{sectionTitle}</p>
          <p className="text-sm text-stone-500 mt-1">{sectionSubtitle}</p>
          {!uploadsAvailable ? (
            <p className="text-sm text-stone-600 mt-2 bg-stone-50 border border-stone-200 rounded-xl p-3" data-testid="photo-upload-disabled-notice">
              {uploadDisabledMessage}
            </p>
          ) : (
            <p className="text-xs text-amber-800 mt-2">
              Only add photos you have permission to save. Photos may contain private information.
            </p>
          )}
        </div>
      )}

      {uploadsAvailable && (
        <label className="flex items-start gap-2 text-sm text-stone-700 cursor-pointer">
          <Checkbox checked={permission} onCheckedChange={(v) => setPermission(!!v)} data-testid="photo-permission-checkbox" />
          Save photo with memory
        </label>
      )}

      {uploadsAvailable && (
      <div className="flex flex-wrap gap-2">
        {showCameraOption && (
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
        )}
        <input
          ref={uploadRef}
          type="file"
          accept={allowedTypes.join(",")}
          className="hidden"
          onChange={(e) => {
            uploadFile(e.target.files?.[0], "upload");
            e.target.value = "";
          }}
        />
        {showCameraOption && (
          <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={loading || atMax || !permission} onClick={() => cameraRef.current?.click()} data-testid="take-photo-btn">
            <Camera className="w-4 h-4 mr-1" /> Take photo
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={loading || atMax || !permission} onClick={() => uploadRef.current?.click()} data-testid="upload-photo-btn">
          <ImagePlus className="w-4 h-4 mr-1" /> Upload photo
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={loading || atMax || !permission} onClick={() => uploadRef.current?.click()} data-testid="attach-image-btn">
          Attach image
        </Button>
      </div>
      )}
      {uploadsAvailable && !cameraSupported && showCameraOption && (
        <p className="text-xs text-stone-500">Choose a photo from your device.</p>
      )}
      {uploadsAvailable && (
      <p className="text-xs text-stone-400">Max {maxFiles} images, {maxSizeMB}MB each. Drafts expire after 24 hours if not saved.</p>
      )}

      {loading && <Loader2 className="w-5 h-5 animate-spin text-sky-600" />}

      {images.length > 0 && (
        <div className="space-y-3">
          {images.map((img) => (
            <PhotoAttachmentPreview
              key={img.id}
              image={img}
              onRemove={removeImage}
              onPatch={patchImage}
              showUseInSummary={showUseInSummary}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-stone-500" data-testid="image-ai-disabled-note">
        Image AI is not enabled. You can describe the photo manually.
      </p>
    </div>
  );
}
