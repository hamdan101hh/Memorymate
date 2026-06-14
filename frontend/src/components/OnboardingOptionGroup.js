export default function OnboardingOptionGroup({ options, value, onChange, testIdPrefix = "option" }) {
  return (
    <div className="space-y-2 text-left" data-testid={`${testIdPrefix}-group`}>
      {options.map((opt) => {
        const selected = value === opt.value;
        const label = opt.label || opt.title;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-testid={`${testIdPrefix}-${opt.value}`}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
              selected ? "border-sky-600 bg-sky-50" : "border-stone-200 hover:border-stone-300 bg-white"
            }`}
          >
            <p className="font-semibold text-stone-900">{label}</p>
            {opt.subtitle && (
              <p className="text-sm text-stone-500 mt-1 leading-relaxed">{opt.subtitle}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
