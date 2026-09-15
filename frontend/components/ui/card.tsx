import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-surface-border bg-surface-raised shadow-subtle",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between border-b border-surface-border px-5 py-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            {eyebrow}
          </p>
        )}
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      {action}
    </div>
  );
}
