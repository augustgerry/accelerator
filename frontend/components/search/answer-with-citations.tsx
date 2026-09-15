export function AnswerWithCitations({
  text,
  sourceCount,
  onCitationClick,
}: {
  text: string;
  sourceCount: number;
  onCitationClick: (index: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        const num = parseInt(match[1], 10);
        const idx = num - 1;
        if (idx < 0 || idx >= sourceCount) return <span key={i}>{part}</span>;
        return (
          <button
            key={i}
            onClick={() => onCitationClick(idx)}
            className="mx-0.5 inline-flex items-center rounded bg-accent-soft px-1 text-[11px] font-bold text-accent-ink hover:bg-accent/30 transition-colors align-middle"
          >
            {part}
          </button>
        );
      })}
    </>
  );
}
