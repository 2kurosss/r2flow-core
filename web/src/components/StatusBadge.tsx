import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  pending: "bg-tag-yellow-bg text-tag-yellow-tx",
  dispatched: "bg-tag-blue-bg text-tag-blue-tx",
  deploying: "bg-tag-blue-bg text-tag-blue-tx",
  running: "bg-tag-blue-bg text-tag-blue-tx",
  in_progress: "bg-tag-blue-bg text-tag-blue-tx",
  new: "bg-tag-yellow-bg text-tag-yellow-tx",
  stopping: "bg-tag-yellow-bg text-tag-yellow-tx",
  completed: "bg-tag-green-bg text-tag-green-tx",
  success: "bg-tag-green-bg text-tag-green-tx",
  deployed: "bg-tag-green-bg text-tag-green-tx",
  online: "bg-tag-green-bg text-tag-green-tx",
  active: "bg-tag-green-bg text-tag-green-tx",
  failed: "bg-tag-red-bg text-tag-red-tx",
  system_failed: "bg-tag-red-bg text-tag-red-tx",
  business_failed: "bg-tag-red-bg text-tag-red-tx",
  stopped: "bg-tag-gray-bg text-tag-gray-tx",
  offline: "bg-tag-gray-bg text-tag-gray-tx",
};

const pulseStatuses = new Set([
  "pending",
  "new",
  "dispatched",
  "deploying",
  "running",
  "in_progress",
  "stopping",
  "online",
  "active",
]);

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-transparent font-medium",
        styles[key] ?? "bg-tag-gray-bg text-tag-gray-tx",
      )}
    >
      {pulseStatuses.has(key) && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {status}
    </Badge>
  );
}
