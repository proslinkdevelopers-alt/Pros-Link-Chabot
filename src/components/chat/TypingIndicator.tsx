export function TypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-xl rounded-tl-sm border bg-card px-4 py-3.5 shadow-soft" role="status">
      <span className="sr-only">The assistant is typing…</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-typing-dot rounded-full bg-primary"
          style={{ animationDelay: `${i * 0.15}s` }}
          aria-hidden
        />
      ))}
    </div>
  );
}
