import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Calm success feedback — CSS only, accessible text, respects reduced motion.
 */
export default function SuccessCheck({
  title = "Success",
  message,
  actions,
  testId = "success-check",
}) {
  return (
    <div
      className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-center"
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <div
        className="mx-auto w-14 h-14 rounded-full bg-emerald-600 text-white grid place-items-center mb-3 mm-success-pop"
        aria-hidden="true"
      >
        <Check className="w-7 h-7" strokeWidth={2.5} />
      </div>
      <p className="font-heading text-lg font-semibold text-emerald-900">{title}</p>
      {message && <p className="text-sm text-stone-700 mt-1">{message}</p>}
      {actions && (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {actions}
        </div>
      )}
    </div>
  );
}

export function SuccessActionButton({ onClick, children, variant = "outline", testId, icon: Icon }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={onClick}
      className="rounded-xl h-9"
      data-testid={testId}
    >
      {Icon && <Icon className="w-3.5 h-3.5 mr-1" />}
      {children}
    </Button>
  );
}

export function CopyDetailsButton({ text, testId = "success-copy" }) {
  return (
    <SuccessActionButton
      testId={testId}
      icon={Copy}
      onClick={() => {
        if (text) navigator.clipboard?.writeText(text);
      }}
    >
      Copy details
    </SuccessActionButton>
  );
}

export function OpenCalendarButton({ href, testId = "success-open-cal" }) {
  if (!href) return null;
  return (
    <SuccessActionButton
      testId={testId}
      icon={ExternalLink}
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
    >
      Open Google Calendar
    </SuccessActionButton>
  );
}

export function CreateAnotherButton({ onClick, testId = "success-create-another" }) {
  return (
    <SuccessActionButton testId={testId} icon={Plus} variant="default" onClick={onClick}>
      Create another
    </SuccessActionButton>
  );
}
