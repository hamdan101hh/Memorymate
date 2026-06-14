export default function OnboardingOptionGroup({
  options,
  value,
  onChange,
  testIdPrefix = "option",
  highlightValue,
}) {
  return (
    <div className="space-y-2 text-left" data-testid={`${testIdPrefix}-group`}>
      {options.map((opt) => {
        const selected = value === opt.value;
        const suggested = highlightValue === opt.value;
        const label = opt.label || opt.title;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-testid={`${testIdPrefix}-${opt.value}`}
            data-suggested={suggested ? "true" : undefined}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
              selected
                ? "border-sky-600 bg-sky-50"
                : suggested
                  ? "border-amber-300 bg-amber-50/50 hover:border-amber-400"
                  : "border-stone-200 hover:border-stone-300 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-stone-900">{label}</p>
              {suggested && !selected && (
                <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                  Suggested
                </span>
              )}
            </div>
            {opt.subtitle && (
              <p className="text-sm text-stone-500 mt-1 leading-relaxed">{opt.subtitle}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
