import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, description, icon, action }: {
  title: string; description?: string; icon?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}