import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthProvider, useAuth } from "@/lib/auth";
import logoImg from "@/assets/logo.png";
import barakahLogo from "@/assets/barakah-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Billova Perfumes" }, { name: "description", content: "Sign in to your Billova Perfumes purchase tracker." }] }),
  component: () => <AuthProvider><LoginInner /></AuthProvider>,
});

function LoginInner() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    if (mode === "forgot") {
      const { error: err } = await resetPassword(email);
      setLoading(false);
      if (err) { setError(err); return; }
      setMessage("Password reset link sent to your email.");
      return;
    }

    const fn = mode === "login" ? signIn : signUp;
    const { error: err } = await fn(email, pwd);
    setLoading(false);
    if (err) { setError(err); return; }
    if (mode === "signup") { setMessage("Account created! Check your email to confirm."); return; }
    navigate({ to: "/" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left panel — desktop only */}
      <div className="hidden flex-col justify-between p-12 text-primary-foreground lg:flex" style={{ background: "var(--gradient-primary)" }}>
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="Billova Perfumes" className="h-12 w-auto object-contain drop-shadow-lg" />
          <span className="font-display text-lg font-bold">Billova Perfumes</span>
        </div>
        <div>
          <h2 className="font-display text-4xl font-bold leading-tight">Every purchase, neatly remembered.</h2>
          <p className="mt-4 max-w-md text-white/80">Track customer histories, recognise loyal shoppers, and keep your shop's ledger calm and searchable.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-white/60">© 2026 Billova Perfumes</p>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span>Developed by</span>
            <a href="https://www.barakahtechnologies.com/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-white/80 transition-colors hover:text-white hover:underline">
              <img src={barakahLogo} alt="Barakah Technologies" className="h-5 w-5 rounded object-contain" />
              Barakah Technologies
            </a>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 lg:hidden">
            <img src={logoImg} alt="Billova Perfumes" className="h-10 w-auto object-contain" />
            <span className="font-display text-lg font-bold">Billova Perfumes</span>
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "login" ? "Sign in to continue to your dashboard." : mode === "signup" ? "Create a new account to get started." : "Enter your email to receive a reset link."}
            </p>
          </div>

          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          {message && <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700">{message}</div>}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@shop.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pwd">Password</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-primary hover:underline">Forgot password?</button>
                  )}
                </div>
                <Input id="pwd" type="password" placeholder="••••••••" value={pwd} onChange={(e) => setPwd(e.target.value)} className="h-11 rounded-xl" required minLength={6} />
              </div>
            )}
          </div>
          <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl text-sm font-semibold" style={{ background: "var(--gradient-primary)" }}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>Don't have an account? <button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }} className="font-medium text-foreground hover:underline">Sign up</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} className="font-medium text-foreground hover:underline">Sign in</button></>
            )}
          </p>
        </form>

        {/* Mobile footer */}
        <div className="mt-8 text-center lg:hidden">
          <p className="text-xs text-muted-foreground">© 2026 Billova Perfumes</p>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span>Developed by</span>
            <a href="https://www.barakahtechnologies.com/" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary hover:underline">
              <img src={barakahLogo} alt="Barakah Technologies" className="h-4 w-4 rounded object-contain" />
              Barakah Technologies
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}