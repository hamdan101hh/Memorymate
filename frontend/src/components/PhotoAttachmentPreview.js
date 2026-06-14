import { useState } from "react";
import AuthenticatedImage from "./AuthenticatedImage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent } from "./ui/dialog";
import { Trash2 } from "lucide-react";

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function PhotoAttachmentPreview({
  image,
  onRemove,
  onPatch,
  showUseInSummary = true,
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="border border-stone-200 rounded-xl p-3 flex gap-3" data-testid="photo-attachment-preview">
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-label="Preview attached photo"
        data-testid={`photo-preview-btn-${image.id}`}
      >
        <AuthenticatedImage path={image.url} className="w-20 h-20 rounded-lg object-cover" />
      </button>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg p-3 sm:p-4" data-testid="photo-attachment-preview-dialog">
          <AuthenticatedImage path={image.url} alt="" className="w-full max-h-[70vh] object-contain rounded-lg mx-auto" />
          {image.filename && (
            <p className="text-sm text-stone-500 text-center mt-2 truncate">{image.filename}</p>
          )}
        </DialogContent>
      </Dialog>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-xs text-stone-500 truncate">
          {image.filename}
          {image.size ? ` · ${formatSize(image.size)}` : ""}
        </p>
        <Input
          placeholder="Describe this photo"
          defaultValue={image.description || ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (image.description || "")) onPatch?.(image.id, { description: v });
          }}
          className="h-9 text-sm rounded-lg"
          data-testid={`photo-desc-${image.id}`}
        />
        <div className="flex flex-wrap gap-2">
          {showUseInSummary && (
            <>
              <Button type="button" size="sm" variant="outline" className="rounded-lg h-8" onClick={() => onPatch?.(image.id, { use_in_summary: true })}>
                Use photo in summary
              </Button>
              <Button type="button" size="sm" variant="ghost" className="rounded-lg h-8" onClick={() => onPatch?.(image.id, { use_in_summary: false })}>
                Do not use in summary
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" className="rounded-lg h-8 text-red-600" onClick={() => onRemove?.(image.id)} data-testid={`remove-photo-${image.id}`}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove photo
          </Button>
        </div>
        {showUseInSummary && !image.use_in_summary && (
          <p className="text-xs text-stone-400">Excluded from AI summary</p>
        )}
      </div>
    </div>
  );
}
