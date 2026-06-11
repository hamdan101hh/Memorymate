import { PURPOSE_OPTIONS } from "../lib/purposeConfig";

export default function PurposeSelector({ value, onChange, testIdPrefix = "purpose" }) {
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-options`}>
      {PURPOSE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            data-testid={`${testIdPrefix}-option-${opt.value}`}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
              selected ? "border-sky-600 bg-sky-50" : "border-stone-200 hover:border-stone-300 bg-white"
            }`}
          >
            <p className="font-semibold text-stone-900">{opt.title}</p>
            <p className="text-sm text-stone-500 mt-1 leading-relaxed">{opt.subtitle}</p>
          </button>
        );
      })}
    </div>
  );
}
