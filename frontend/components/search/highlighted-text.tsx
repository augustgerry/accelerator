// Search results come from indexed source documents (and LLM answers) that may
// contain literal markdown — strip it for display since actual bold/italic
// formatting is already visible in the real document preview, not needed here.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1");
}

export function highlightKeywords(text: string, query: string): string {
  if (!query.trim()) return text;
  const words = query.trim().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.replace(pattern, "**$1**");
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const highlighted = highlightKeywords(stripMarkdown(text), query);
  const parts = highlighted.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft text-accent-ink rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}
