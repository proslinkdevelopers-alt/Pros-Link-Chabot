import { CREDIT } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Optional credit for whoever built or maintains the deployment. Renders
 * nothing unless NEXT_PUBLIC_CREDIT_NAME and NEXT_PUBLIC_CREDIT_URL are set.
 */
export function Credit({ className }: { className?: string }) {
  if (!CREDIT.name || !CREDIT.url) return null;
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)}>
      Built by{" "}
      <a href={CREDIT.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-foreground">
        {CREDIT.name}
      </a>
    </p>
  );
}
