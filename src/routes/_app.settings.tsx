import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store, User, Lock, KeyRound, Palette, Database } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { updateAdminPasscode } from "@/lib/data";
import barakahLogo from "@/assets/barakah-logo.png";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — Hira Perfumes" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [changingPasscode, setChangingPasscode] = useState(false);

  const changePassword = async () => {
    if (newPwd.length < 6) { toast.error("Password must be at least 6 characters."); return; }
    if (newPwd !== confirmPwd) { toast.error("Passwords do not match."); return; }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated successfully!");
    setNewPwd(""); setConfirmPwd("");
  };

  const changeAdminPasscode = async () => {
    if (!newPasscode.trim()) { toast.error("Please enter a new passcode."); return; }
    if (newPasscode !== confirmPasscode) { toast.error("Passcodes do not match."); return; }
    setChangingPasscode(true);
    const ok = await updateAdminPasscode(newPasscode.trim());
    setChangingPasscode(false);
    if (ok) {
      toast.success("Admin bill edit passcode updated successfully!");
      setNewPasscode("");
      setConfirmPasscode("");
    } else {
      toast.error("Failed to update passcode. Please run the SQL migration or check permissions.");
    }
  };

  return (
    <>
      <AppHeader title="Settings" />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Business Info */}
          <Section icon={Store} title="Business Details" desc="Your shop information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business Name" value="Hira Perfumes" readOnly />
              <Field label="Business Type" value="Fragrance & Attar" readOnly />
              <Field label="Currency" value="INR (₹)" readOnly />
              <Field label="Timezone" value="Asia/Kolkata (IST)" readOnly />
            </div>
          </Section>

          {/* Account */}
          <Section icon={User} title="Account" desc="Your profile details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" value={user?.email ?? "—"} readOnly />
              <Field label="User ID" value={user?.id ? user.id.substring(0, 16) + "..." : "—"} readOnly />
              <Field label="Member Since" value={user?.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} readOnly />
              <Field label="Last Sign-in" value={user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("en-IN") : "—"} readOnly />
            </div>
          </Section>

          {/* Admin Edit Passcode */}
          <Section icon={KeyRound} title="Admin Edit Passcode" desc="Passcode required to edit customer bills & purchases">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>New Passcode</Label>
                <Input
                  type="text"
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  placeholder="e.g. 9789"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Passcode</Label>
                <Input
                  type="text"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Repeat new passcode"
                  className="rounded-xl"
                />
              </div>
            </div>
            <Button
              onClick={changeAdminPasscode}
              disabled={changingPasscode}
              className="mt-4 rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
            >
              {changingPasscode ? "Updating Passcode..." : "Update Passcode"}
            </Button>
          </Section>

          {/* Password */}
          <Section icon={Lock} title="Change Password" desc="Update your account password">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min 6 characters" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="Repeat password" className="rounded-xl" />
              </div>
            </div>
            <Button onClick={changePassword} disabled={changingPwd} className="mt-4 rounded-xl" style={{ background: "var(--gradient-primary)" }}>
              {changingPwd ? "Updating..." : "Update Password"}
            </Button>
          </Section>

          {/* Database */}
          <Section icon={Database} title="Database" desc="Connection status">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium">Connected to Supabase</span>
              <span className="text-xs text-muted-foreground">Project: {import.meta.env.VITE_SUPABASE_URL?.replace("https://", "").replace(".supabase.co", "") ?? "xpsopjgsxrutssxajezx"}</span>
            </div>
          </Section>

          {/* Theme */}
          <Section icon={Palette} title="Appearance" desc="Visual preferences">
            <div className="flex items-center gap-3">
              <Button variant="outline" className="rounded-xl" onClick={() => { document.documentElement.classList.remove("dark"); toast.success("Light mode"); }}>☀️ Light</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => { document.documentElement.classList.add("dark"); toast.success("Dark mode"); }}>🌙 Dark</Button>
            </div>
          </Section>

          <div className="space-y-1 py-4 text-center">
            <p className="text-xs text-muted-foreground">Hira Perfumes Purchase Tracker v1.0.0</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <span>Developed by</span>
              <a href="https://www.barakahtechnologies.com/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary hover:underline">
                <img src={barakahLogo} alt="Barakah Technologies" className="h-4 w-4 rounded object-contain" />
                Barakah Technologies
              </a>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Section({ icon: Icon, title, desc, children }: { icon: any; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent"><Icon className="h-5 w-5 text-accent-foreground" /></div>
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} readOnly={readOnly} className="rounded-xl bg-muted/30" />
    </div>
  );
}