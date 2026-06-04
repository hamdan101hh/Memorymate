import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/common";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Lock, LockKeyhole, ShieldCheck, Loader2, ArrowLeft, KeyRound, Users, MapPin } from "lucide-react";
import { toast } from "sonner";

function SetPinForm({ hasPin, onDone }) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (pin.length < 4) { toast.error("PIN must be at least 4 characters."); return; }
    if (pin !== confirm) { toast.error("PINs do not match."); return; }
    setSaving(true);
    try {
      await api.post("/capture/vault/pin", { pin, current_pin: hasPin ? current : undefined });
      toast.success(hasPin ? "PIN changed" : "Vault PIN set");
      setCurrent(""); setPin(""); setConfirm("");
      onDone?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not save PIN");
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 max-w-md" data-testid="vault-setpin-form">
      <div className="flex items-center gap-2 font-semibold text-stone-800"><KeyRound className="w-5 h-5 text-sky-600" /> {hasPin ? "Change vault PIN" : "Set a vault PIN"}</div>
      <p className="text-sm text-stone-600">This PIN protects sensitive content. Keep it private — anyone with it can open the vault.</p>
      {hasPin && (
        <Input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current PIN" className="h-11 rounded-xl" data-testid="vault-current-pin" />
      )}
      <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="New PIN (4+ characters)" className="h-11 rounded-xl" data-testid="vault-new-pin" />
      <Input type="password" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm PIN" className="h-11 rounded-xl" data-testid="vault-confirm-pin" />
      <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-700" data-testid="vault-savepin-btn">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : hasPin ? "Change PIN" : "Set PIN"}
      </Button>
    </div>
  );
}

function VaultItem({ ev }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4" data-testid="vault-item-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{ev.title}</h3>
        <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-700"><Lock className="w-3.5 h-3.5" /> private</span>
      </div>
      {ev.summary && <p className="text-sm text-stone-700 mt-1">{ev.summary}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {ev.people?.map((p, i) => <span key={`${ev.id}-pe-${i}`} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-stone-100 text-stone-600"><Users className="w-3 h-3" /> {p}</span>)}
        {ev.places?.map((p, i) => <span key={`${ev.id}-pl-${i}`} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-stone-100 text-stone-600"><MapPin className="w-3 h-3" /> {p}</span>)}
      </div>
      {ev.created_at && <p className="text-xs text-stone-400 mt-2">{ev.created_at.slice(0, 10)}</p>}
    </div>
  );
}

export default function PrivacyVault() {
  const { user } = useAuth();
  const base = user.role === "patient" ? "/patient" : "/caregiver";
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const loadStatus = useCallback(() => api.get("/capture/vault/status").then(({ data }) => setStatus(data)), []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const unlock = async () => {
    if (!pin) { toast.error("Enter your PIN."); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/capture/vault/unlock", { pin });
      setItems(data.items);
      setPin("");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not unlock");
    } finally { setBusy(false); }
  };

  const lock = () => { setItems(null); };

  if (!status) return <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-sky-600" /></div>;

  return (
    <div className="mm-fade-up max-w-3xl" data-testid="privacy-vault-page">
      <button onClick={() => navigate(base)} className="text-sky-700 font-medium mb-3 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <div className="flex items-center gap-3 mb-1">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-stone-900 text-white"><LockKeyhole className="w-6 h-6" /></span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold">Private Vault</h1>
      </div>
      <p className="text-stone-600 mb-6">Sensitive things the AI detected are kept here, locked behind your PIN — never shown on the timeline, reminders, or shared summaries.</p>

      {/* No PIN yet → set one */}
      {!status.pin_set && (
        <>
          <SetPinForm hasPin={false} onDone={loadStatus} />
        </>
      )}

      {/* PIN set, locked → ask for PIN */}
      {status.pin_set && items === null && !changing && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 max-w-md" data-testid="vault-locked">
          <div className="flex items-center gap-2 font-semibold"><Lock className="w-5 h-5 text-stone-700" /> Vault is locked</div>
          <p className="text-sm text-stone-600">{status.locked_count} private item(s) inside.</p>
          <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="Enter PIN" className="h-11 rounded-xl" data-testid="vault-unlock-pin" />
          <Button onClick={unlock} disabled={busy} className="w-full h-11 rounded-xl bg-stone-900 hover:bg-stone-800" data-testid="vault-unlock-btn">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShieldCheck className="w-5 h-5 mr-1" /> Unlock</>}
          </Button>
          <button onClick={() => setChanging(true)} className="text-sm text-stone-500 hover:text-stone-700" data-testid="vault-change-link">Change PIN</button>
        </div>
      )}

      {/* Changing PIN */}
      {status.pin_set && changing && items === null && (
        <div className="space-y-3">
          <SetPinForm hasPin onDone={() => { setChanging(false); loadStatus(); }} />
          <button onClick={() => setChanging(false)} className="text-sm text-stone-500 hover:text-stone-700">Cancel</button>
        </div>
      )}

      {/* Unlocked → show items */}
      {items !== null && (
        <div data-testid="vault-unlocked">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-emerald-700 inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Unlocked — {items.length} item(s)</p>
            <Button size="sm" variant="outline" onClick={lock} className="rounded-xl" data-testid="vault-lock-btn"><Lock className="w-4 h-4 mr-1" /> Lock</Button>
          </div>
          {items.length === 0 ? (
            <EmptyState icon={LockKeyhole} title="Vault is empty" message="When a capture session detects sensitive content, it is locked here automatically." testid="vault-empty" />
          ) : (
            <div className="space-y-3">{items.map((ev) => <VaultItem key={ev.id} ev={ev} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}
