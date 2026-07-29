'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

function textOf(message: { parts: Array<{ type: string }> }) {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

const SUGGESTIONS = [
  'Explain a tricky idea simply',
  'Draft an email for me',
  'Plan my week around one big goal',
  'Review this code and find the bug',
];

export default function Chat() {
  const { messages, sendMessage, status, stop, error, regenerate } = useChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, status]);

  // Grow the textarea with its content, up to ~6 rows.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`;
  }, [input]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput('');
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-md bg-neutral-900 text-xs font-bold text-white dark:bg-white dark:text-neutral-900"
          >
            C
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Claude</h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {busy ? 'Thinking…' : 'Ready'}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => location.reload()}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            New chat
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="pt-10 text-center sm:pt-20">
              <h2 className="text-xl font-semibold sm:text-2xl">
                What can I help with?
              </h2>
              <div className="mx-auto mt-6 grid max-w-lg gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-[15px] whitespace-pre-wrap text-white dark:bg-neutral-100 dark:text-neutral-900'
                        : 'max-w-full text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-[90%]'
                    }
                  >
                    {textOf(m) ||
                      (busy && m.role === 'assistant' ? (
                        <span className="inline-block animate-pulse text-neutral-400">
                          ●●●
                        </span>
                      ) : null)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="font-medium">Something went wrong.</p>
              <p className="mt-0.5 text-[13px] opacity-90">{error.message}</p>
              <button
                type="button"
                onClick={() => regenerate()}
                className="mt-2 rounded border border-red-400 px-2 py-1 text-xs font-medium dark:border-red-800"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-950">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="Message Claude…"
            className="flex-1 resize-none rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-[16px] outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-200 text-neutral-700 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200"
              aria-label="Stop generating"
            >
              <span className="block size-3 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-900 text-white transition disabled:opacity-30 dark:bg-white dark:text-neutral-900"
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <path d="M12 4l7 7h-4.5v9h-5v-9H5l7-7z" />
              </svg>
            </button>
          )}
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-neutral-400">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
