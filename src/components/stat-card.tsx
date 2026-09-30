import type { LucideIcon } from "lucide-react";

export function StatCard({
  label, value, icon: Icon, trend, tone = "default",
}: { label: string; value: string; icon: LucideIcon; trend?: string; tone?: "default" | "primary" }) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5"
      style={{ boxShadow: "var(--shadow-elegant)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {trend && <p className="mt-1 text-xs text-success">{trend}</p>}
        </div>
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={tone === "primary"
            ? { background: "var(--gradient-primary)", color: "var(--primary-foreground)" }
            : { backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}