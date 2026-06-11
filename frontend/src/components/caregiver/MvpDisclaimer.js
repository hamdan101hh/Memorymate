/** Calm safety reminder for AI and appointment flows. */
export default function MvpDisclaimer({ className = "" }) {
  return (
    <p className={`text-xs text-stone-500 leading-relaxed ${className}`} data-testid="mvp-disclaimer">
      MemoryMate helps organize appointments and reminders. It does not provide medical advice or emergency support.
    </p>
  );
}
