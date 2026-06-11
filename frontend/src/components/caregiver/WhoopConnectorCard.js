import { useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../ui/dialog";
import { Activity, Lock } from "lucide-react";

export default function WhoopConnectorCard() {
  const [learnOpen, setLearnOpen] = useState(false);
  const enabled = process.env.REACT_APP_WHOOP_CONNECTOR_ENABLED === "true";

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 mb-5" data-testid="whoop-connector-card">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-violet-100 text-violet-700 shrink-0">
          <Activity className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">WHOOP integration — planned</h2>
          <p className="text-sm text-stone-500 mt-1">
            Connect recovery, sleep, and activity summaries in the future. MemoryMate will only use this with your permission and according to WHOOP&apos;s official developer rules.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setLearnOpen(true)} data-testid="whoop-learn-btn">
              Learn what this could do
            </Button>
            <Button size="sm" disabled className="rounded-xl opacity-60" data-testid="whoop-connect-btn">
              <Lock className="w-3.5 h-3.5 mr-1" /> Connect WHOOP — Coming soon
            </Button>
          </div>
          {enabled && (
            <p className="text-xs text-amber-700 mt-2">Feature flag is on but live OAuth is not enabled in this build.</p>
          )}
        </div>
      </div>
      <Dialog open={learnOpen} onOpenChange={setLearnOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>WHOOP — future wellness summaries</DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2">
              <p>If WHOOP offers official API access and terms allow it, MemoryMate could show simple wellness summaries you choose to share — not medical diagnosis.</p>
              <p>We will not scrape WHOOP, ask for passwords, or diagnose health conditions. See docs/WHOOP_CONNECTOR_LEGAL_PLAN.md for the full plan.</p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
