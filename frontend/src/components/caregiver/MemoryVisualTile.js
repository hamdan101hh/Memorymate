import { getMemoryVisual } from "../../lib/memoryVisuals";
import { isProtectedImagePath } from "../../lib/authenticatedImage";
import AuthenticatedImage from "../AuthenticatedImage";

export default function MemoryVisualTile({ memory, compact }) {
  const visual = getMemoryVisual(memory);
  const Icon = visual.icon;
  const imagePath = memory?.image_url || memory?.photo_url;
  const hasImage = isProtectedImagePath(imagePath);
  const attachCount = memory?.attachment_count || memory?.image_ids?.length || 0;

  if (hasImage) {
    return (
      <div className={`relative shrink-0 ${compact ? "w-12 h-12" : "w-full h-24"}`}>
        <AuthenticatedImage
          path={imagePath}
          alt=""
          className={`rounded-lg object-cover ${compact ? "w-12 h-12" : "w-full h-24"}`}
        />
        {attachCount > 1 && (
          <span className="absolute bottom-0 right-0 text-[10px] bg-stone-900/75 text-white px-1.5 py-0.5 rounded-tl-lg rounded-br-lg">
            +{attachCount - 1}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg shrink-0 grid place-items-center bg-gradient-to-br ${visual.gradient} ${
        compact ? "w-12 h-12" : "w-full h-24"
      }`}
      aria-label={visual.label}
      data-testid="memory-visual-placeholder"
    >
      {compact ? (
        <span className="text-lg" aria-hidden="true">{visual.emoji}</span>
      ) : (
        <div className="text-center px-2">
          <Icon className="w-6 h-6 text-stone-600 mx-auto mb-1" aria-hidden="true" />
          <span className="text-[10px] font-medium text-stone-600">{visual.label}</span>
        </div>
      )}
    </div>
  );
}
