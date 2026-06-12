import AuthenticatedImage from "./AuthenticatedImage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  return (
    <div className="border border-stone-200 rounded-xl p-3 flex gap-3" data-testid="photo-attachment-preview">
      <AuthenticatedImage path={image.url} className="w-20 h-20 rounded-lg object-cover shrink-0" />
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
