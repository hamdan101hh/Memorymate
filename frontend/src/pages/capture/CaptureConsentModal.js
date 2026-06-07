import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Checkbox } from "../../components/ui/checkbox";
import { Button } from "../../components/ui/button";
import { Loader2, Infinity as InfinityIcon } from "lucide-react";

const ITEMS = [
  { k: "not_medical", label: "I understand MemoryMate is not a medical or emergency service." },
  { k: "inform_others", label: "I understand I should inform people nearby when capture is on." },
  { k: "controls", label: "I understand I can pause, stop, or delete capture anytime." },
  {
    k: "policy",
    label: (
      <>I agree to the{" "}
        <a href="/consent" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">Consent &amp; Recording Policy</a>.
      </>
    ),
  },
];

export default function CaptureConsentModal({ open, onOpenChange, onConfirm, loading = false }) {
  const [checked, setChecked] = useState({});
  const allChecked = ITEMS.every((it) => checked[it.k]);

  const handleOpenChange = (v) => {
    if (!v) setChecked({}); // reset when closing
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl max-w-md" data-testid="capture-consent-modal">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Turn on Smart Background Memory Capture?</DialogTitle>
          <DialogDescription className="text-stone-600 text-[15px] leading-relaxed pt-1">
            MemoryMate can help capture useful daily moments and turn them into reminders and summaries.
            Capture is optional. You can pause or stop it anytime. People nearby should be aware when
            capture is on.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {ITEMS.map((it) => (
            <label key={it.k} className="flex items-start gap-3 cursor-pointer text-sm text-stone-700">
              <Checkbox
                checked={!!checked[it.k]}
                onCheckedChange={(v) => setChecked((c) => ({ ...c, [it.k]: !!v }))}
                className="mt-0.5"
                data-testid={`consent-check-${it.k}`}
              />
              <span>{it.label}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)} data-testid="consent-cancel-btn">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!allChecked || loading}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
            data-testid="consent-confirm-btn"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><InfinityIcon className="w-4 h-4 mr-1.5" /> Turn On Capture</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
