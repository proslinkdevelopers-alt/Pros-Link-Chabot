"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, MicOff, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { speechTagFor } from "@/lib/i18n";

export interface ChatInputHandle {
  focus(): void;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

/**
 * The composer: an auto-growing textarea (Enter sends, Shift+Enter adds a
 * line) and, where the browser supports it, voice input.
 */
export const ChatInput = forwardRef<ChatInputHandle, {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder: string;
}>(function ChatInput({ onSend, disabled, placeholder }, ref) {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }));

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Grow with the content, up to a cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  function toggleVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = speechTagFor(value);
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      setValue(Array.from(event.results).map((result) => result[0].transcript).join(""));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="flex items-end gap-1.5 rounded-xl border bg-card p-1.5 shadow-soft transition focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
      <label htmlFor="chat-input" className="sr-only">
        Message
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={2000}
        placeholder={placeholder}
        className="max-h-36 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        disabled={disabled}
      />

      {voiceSupported && (
        <button
          type="button"
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={listening ? "Stop voice input" : "Speak your message"}
          aria-pressed={listening}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg transition disabled:opacity-40",
            listening ? "bg-destructive text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          {listening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
        </button>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-brand transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
      >
        <SendHorizontal className="size-[18px]" />
      </button>
    </div>
  );
});
