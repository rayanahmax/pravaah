"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import type { ChatTurn } from "@/lib/chat";
import styles from "./chat.module.css";

/**
 * Floating visitor assistant.
 *
 * A thin client over POST /api/v1/chat: it renders the conversation, sends the
 * current message plus prior turns, and shows whatever the server composed. It has
 * no knowledge of destinations, permits or rules and builds no answer of its own —
 * every fact is computed server-side under row level security, so the browser
 * cannot ask for more than the signed-in visitor could already see.
 *
 * The transcript lives in React state only (never browser storage), and closing the
 * panel keeps it for the page session. It is a floating panel rather than a page
 * route, and deliberately sits on the opposite corner to the SOS control.
 */

type Reply = { reply: string; usedAi: boolean; suggestions: string[] };

type Bubble = ChatTurn & { id: number; usedAi?: boolean };

const GREETING: Bubble = {
  id: 0,
  role: "assistant",
  content:
    "Hi! I'm the PRAVAAH visitor assistant. I can tell you what's open, how full a place is, any active alerts, how permits work, and the status of your own permits.",
};

export function ChatDock() {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "What's open right now?",
    "How do permits work?",
    "Any active alerts?",
  ]);

  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Escape closes; clicking a number in the transcript is not a concern here, so
  // outside-click does not close (it would risk losing a half-typed question).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [bubbles, sending]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || sending) return;

    setInput("");
    setSuggestions([]);
    setSending(true);

    const history: ChatTurn[] = bubbles
      .filter((b) => b.id !== GREETING.id)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));

    const result = await apiPost<Reply>("/api/v1/chat", { message: question, history });

    setBubbles((current) => [
      ...current,
      { id: nextId.current++, role: "user", content: question },
      {
        id: nextId.current++,
        role: "assistant",
        content: result.ok
          ? result.data.reply
          : "I couldn't reach the assistant just now. Please try again — your destination pages still show live status.",
        usedAi: result.ok ? result.data.usedAi : false,
      },
    ]);
    if (result.ok) setSuggestions(result.data.suggestions.slice(0, 3));
    setSending(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <div className={styles.dock} ref={rootRef}>
      {open ? (
        <section
          className={styles.panel}
          id="prv-chat-panel"
          role="dialog"
          aria-label="PRAVAAH visitor assistant"
        >
          <header className={styles.head}>
            <span className={styles.headTitle}>
              <Sparkles size={16} aria-hidden="true" />
              Visitor assistant
            </span>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close assistant"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.log} ref={logRef} aria-live="polite">
            {bubbles.map((bubble) => (
              <p key={bubble.id} className={`${styles.bubble} ${styles[bubble.role]}`}>
                {bubble.content}
              </p>
            ))}
            {sending ? (
              <p className={`${styles.bubble} ${styles.assistant} ${styles.typing}`}>
                <Loader2 size={14} className={styles.spin} aria-hidden="true" /> Thinking…
              </p>
            ) : null}
          </div>

          {suggestions.length > 0 && !sending ? (
            <div className={styles.chips}>
              {suggestions.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={styles.chip}
                  onClick={() => void ask(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <form className={styles.composer} onSubmit={submit}>
            <input
              ref={inputRef}
              className={styles.field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={800}
              placeholder="Ask about access, alerts or permits…"
              aria-label="Your question"
              disabled={sending}
            />
            <button type="submit" className={styles.send} disabled={sending || !input.trim()} aria-label="Send">
              <Send size={16} aria-hidden="true" />
            </button>
          </form>

          <p className={styles.disclaimer}>
            General guidance only. The department decides access and permits; use SOS for
            emergencies.
          </p>
        </section>
      ) : null}

      <button
        type="button"
        ref={toggleRef}
        className={styles.fab}
        aria-expanded={open}
        aria-controls={open ? "prv-chat-panel" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
        <span>{open ? "Close" : "Assistant"}</span>
      </button>
    </div>
  );
}
