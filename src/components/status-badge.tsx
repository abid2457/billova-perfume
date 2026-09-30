import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: "Completed" | "Pending" | "Refunded" }) {
  const styles =
    status === "Completed" ? "bg-success/15 text-success border-success/30" :
    status === "Pending" ? "bg-warning/15 text-warning border-warning/30" :
    "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", styles)}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}