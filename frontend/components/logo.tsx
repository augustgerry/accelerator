export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-md bg-accent-ink ${className ?? ""}`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        className="text-accent"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="6" y1="18" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" />
        <line x1="6" y1="18" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6" cy="18" r="3" fill="currentColor" />
        <circle cx="18" cy="6" r="3" fill="currentColor" />
        <circle cx="18" cy="18" r="3" fill="currentColor" />
      </svg>
    </div>
  );
}
