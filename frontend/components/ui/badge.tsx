import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "info";
  className?: string;
};

const toneStyles: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-surface text-text-secondary border-surface-border",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  info: "bg-secondary-soft text-secondary border-transparent",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
