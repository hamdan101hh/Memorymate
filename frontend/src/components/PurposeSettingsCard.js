import { useState, useEffect } from "react";
import api from "../lib/api";
import PurposeSelector from "./PurposeSelector";
import { purposeLabel } from "../lib/purposeConfig";
import { Button } from "./ui/button";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PurposeSettingsCard({ user, refreshUser, testId = "settings-purpose" }) {
  const [purpose, setPurpose] = useState(user?.memorymate_purpose || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.memorymate_purpose) setPurpose(user.memorymate_purpose);
  }, [user?.memorymate_purpose]);

  const save = async () => {
    if (!purpose) {
      toast.error("Please choose a purpose");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/auth/onboarding", { memorymate_purpose: purpose });
      await refreshUser?.();
      toast.success("MemoryMate purpose updated");
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 mb-5" data-testid={testId}>
      <h2 className="font-semibold mb-1">MemoryMate purpose</h2>
      <p className="text-sm text-stone-500 mb-4">
        How you use MemoryMate today. Current: {user?.memorymate_purpose ? purposeLabel(user.memorymate_purpose) : "Not set"}.
      </p>
      <PurposeSelector value={purpose} onChange={setPurpose} testIdPrefix="settings-purpose" />
      <Button onClick={save} disabled={saving} className="mt-4 rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="settings-purpose-save">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
        Save purpose
      </Button>
    </div>
  );
}
