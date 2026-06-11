import { getMemoryVisual } from "../lib/memoryVisuals";

export default function MemoryVisualTile({ memory, compact }) {
  const visual = getMemoryVisual(memory);
  const Icon = visual.icon;
  const hasImage = memory?.image_url || memory?.photo_url;

  if (hasImage) {
    return (
      <img
        src={memory.image_url || memory.photo_url}
        alt=""
        className={`rounded-lg object-cover shrink-0 ${compact ? "w-12 h-12" : "w-full h-24"}`}
      />
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
