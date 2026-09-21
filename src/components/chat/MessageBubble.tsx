import { CalendarCheck, ChevronRight, ClipboardCheck, FileText, UserRound, Wrench } from "lucide-react";
import { LogoMark } from "@/components/branding/Logo";
import { cn, isUrduScript } from "@/lib/utils";
import type { CapturedRecord, Choice, Outgoing } from "@/types";

export type ChatEntry =
  | { id: string; from: "user"; text: string }
  | { id: string; from: "staff"; text: string }
  | { id: string; from: "bot"; message: Outgoing; records?: CapturedRecord[] };

const RECEIPTS: Record<CapturedRecord["kind"], { label: string; icon: typeof ClipboardCheck }> = {
  LEAD: { label: "Enquiry passed to our team", icon: ClipboardCheck },
  QUOTE: { label: "Quote request", icon: FileText },
  MEETING: { label: "Appointment request", icon: CalendarCheck },
  TICKET: { label: "Service ticket", icon: Wrench },
};

/**
 * One entry in the transcript: the customer's message, a reply from a member
 * of staff, or the assistant's message with its buttons or options.
 */
export function MessageBubble({
  entry,
  onChoose,
  disabled,
}: {
  entry: ChatEntry;
  onChoose: (choice: Choice) => void;
  disabled?: boolean;
}) {
  if (entry.from === "user") {
    return (
      <div className="flex justify-end animate-fade-in-up">
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-brand px-3.5 py-2.5 text-[15px] leading-relaxed text-white shadow-brand md:max-w-[70%]",
            isUrduScript(entry.text) && "urdu"
          )}
        >
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.from === "staff") {
    return (
      <Row avatar={<span className="grid size-8 place-items-center rounded-full bg-emerald-600 text-white"><UserRound className="size-4" /></span>}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Pros-Link team</p>
        <Bubble text={entry.text} />
      </Row>
    );
  }

  const { message } = entry;
  const body = message.type === "text" ? message.body : message.body === "👇" ? "" : message.body;

  return (
    <Row avatar={<LogoMark className="size-8" />}>
      <div className="flex min-w-0 flex-col gap-2">
        {message.type === "buttons" && message.header?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- product photos come from any host staff enter
          <img
            src={message.header.imageUrl}
            alt=""
            className="max-h-56 w-full max-w-sm rounded-xl border bg-white object-contain p-2"
            loading="lazy"
          />
        )}
        {body && <Bubble text={body} />}

        {message.type === "buttons" && (
          <div className="flex flex-wrap gap-2">
            {message.buttons.map((button) => (
              <button
                key={button.id}
                type="button"
                disabled={disabled}
                onClick={() => onChoose(button)}
                className="rounded-lg border border-primary/25 bg-card px-3.5 py-2 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/50 hover:bg-primary/[0.04] disabled:opacity-50"
              >
                {button.title}
              </button>
            ))}
          </div>
        )}

        {message.type === "list" && (
          <ul className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-soft" role="list">
            {message.rows.map((row) => (
              <li key={row.id} className="border-b last:border-0">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChoose(row)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-secondary/60 disabled:opacity-50"
                >
                  {row.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- product thumbnails from any host
                    <img src={row.imageUrl} alt="" className="size-11 shrink-0 rounded-md border bg-white object-contain" loading="lazy" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{row.title}</span>
                    {row.description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{row.description}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {entry.records?.map((record) => {
          const receipt = RECEIPTS[record.kind];
          return (
            <p
              key={record.reference}
              className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-900"
            >
              <receipt.icon className="size-3.5 shrink-0" aria-hidden />
              <span>{receipt.label}</span>
              <span className="font-mono text-[12px] font-semibold tracking-wide">{record.reference}</span>
            </p>
          );
        })}
      </div>
    </Row>
  );
}

function Row({ avatar, children }: { avatar: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 animate-fade-in-up">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {avatar}
      </span>
      <div className="min-w-0 max-w-[88%] md:max-w-[75%]">{children}</div>
    </div>
  );
}

function Bubble({ text }: { text: string }) {
  return (
    <div
      className={cn(
        "rounded-xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-[15px] leading-relaxed text-foreground shadow-soft",
        isUrduScript(text) && "urdu"
      )}
    >
      {renderText(text)}
    </div>
  );
}

/** Lines, bullets and inline marks — rendered as elements, never as HTML. */
function renderText(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <span key={i} className="block h-2" aria-hidden />;

    const bullet = /^([-*•])\s+/.exec(trimmed);
    const numbered = /^(\d+)\.\s+/.exec(trimmed);
    if (bullet || numbered) {
      const clean = trimmed.replace(/^([-*•]|\d+\.)\s+/, "");
      return (
        <p key={i} className="mt-1 flex gap-2">
          <span className="select-none font-semibold text-primary">{numbered ? `${numbered[1]}.` : "•"}</span>
          <span className="min-w-0">{inline(clean)}</span>
        </p>
      );
    }
    return (
      <p key={i} className={cn(i > 0 && "mt-1")}>
        {inline(line)}
      </p>
    );
  });
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s)]+)/g;

function inline(text: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-primary underline underline-offset-2">
          {part}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}
