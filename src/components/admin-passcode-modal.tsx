import { useState, useRef, useEffect } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { verifyAdminPasscode } from "@/lib/data";

interface Props {
  open: boolean;
  onCancel: () => void;
  /** Called only after the DB confirms the correct passcode */
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function AdminPasscodeModal({ open, onCancel, onVerified, title = "Admin Verification", description = "Enter the admin passcode to proceed." }: Props) {
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  // readOnly trick: prevents Chrome/Safari from autofilling on mount
  const [readOnly, setReadOnly] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Reset everything whenever the modal opens ────────────────────────────
  useEffect(() => {
    if (open) {
      setCode("");
      setError("");
      setLoading(false);
      setReadOnly(true);
      // Remove readOnly after a short tick so the browser can't autofill,
      // then focus the now-empty input
      const t = setTimeout(() => {
        setReadOnly(false);
        // Force-clear any value the browser may have injected
        if (inputRef.current) {
          inputRef.current.value = "";
          inputRef.current.focus();
        }
      }, 80);
      return () => clearTimeout(t);
    } else {
      // Always wipe on close too
      setCode("");
      setError("");
      setLoading(false);
    }
  }, [open]);

  const verify = async () => {
    if (!code.trim()) { setError("Please enter the passcode."); return; }
    setLoading(true);
    setError("");
    const ok = await verifyAdminPasscode(code.trim());
    setLoading(false);
    if (ok) {
      setCode("");
      onVerified();
    } else {
      setError("Incorrect passcode. Please try again.");
      setCode("");                         // clear field so user re-enters cleanly
      if (inputRef.current) {
        inputRef.current.value = "";       // also clear DOM value directly
        inputRef.current.focus();
      }
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") verify();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        className="rounded-2xl sm:max-w-sm"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div
            className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <DialogTitle className="text-center text-lg">{title}</DialogTitle>
          <p className="text-center text-sm text-muted-foreground">
            {description}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="passcode-input">Passcode</Label>

            {/*
              Key anti-autofill attributes:
                - autoComplete="new-password"  → tells password managers this is
                  a creation field, not a login field (most reliable cross-browser)
                - readOnly until after mount    → prevents Chrome from injecting a
                  saved password before React state is ready
                - name=""                       → no meaningful name for password managers
                  to latch onto
            */}
            <input
              ref={inputRef}
              id="passcode-input"
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              name="admin-passcode-field"
              readOnly={readOnly}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
              onFocus={() => setReadOnly(false)}
              onKeyDown={onKey}
              placeholder=""
              disabled={loading}
              className="flex h-12 w-full rounded-xl border border-input bg-background px-4 text-center text-2xl tracking-[0.5em] outline-none ring-ring transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ letterSpacing: code.length > 0 ? "0.5em" : "normal" }}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="h-11 flex-1 rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
              onClick={verify}
              disabled={loading || !code.trim()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
