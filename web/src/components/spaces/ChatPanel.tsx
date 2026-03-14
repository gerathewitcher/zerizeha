import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  author: string;
  time: string;
  text: string;
  status?: "sending" | "failed";
  error?: string;
};

type ChatPanelProps = {
  channelTitle: string;
  messages: ChatMessage[];
  loading?: boolean;
  disabled?: boolean;
  canLoadOlder?: boolean;
  loadingOlder?: boolean;
  onOpenSpaces?: () => void;
  onOpenChannels?: () => void;
  onOpenVoice?: () => void;
  onSendMessage?: (body: string) => Promise<void> | void;
  onLoadOlder?: () => Promise<void> | void;
  onRetryMessage?: (messageId: string) => Promise<void> | void;
};

export default function ChatPanel({
  channelTitle,
  messages,
  loading = false,
  disabled = false,
  canLoadOlder = false,
  loadingOlder = false,
  onOpenSpaces,
  onOpenChannels,
  onOpenVoice,
  onSendMessage,
  onLoadOlder,
  onRetryMessage,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasInitialScrollRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const lastMessageId = useMemo(
    () => messages[messages.length - 1]?.id ?? null,
    [messages],
  );

  const handleSend = async () => {
    const nextBody = draft.trim();
    if (!nextBody || submitting || disabled || !onSendMessage) return;

    setSubmitting(true);
    try {
      await onSendMessage(nextBody);
      setDraft("");
      shouldRestoreFocusRef.current = true;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    hasInitialScrollRef.current = false;
  }, [channelTitle]);

  useEffect(() => {
    if (loading || loadingOlder || !lastMessageId) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: hasInitialScrollRef.current ? "smooth" : "auto",
    });

    hasInitialScrollRef.current = true;
  }, [lastMessageId, loading, loadingOlder]);

  useEffect(() => {
    if (submitting || disabled || !shouldRestoreFocusRef.current) return;

    shouldRestoreFocusRef.current = false;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [disabled, submitting]);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-(--border) bg-(--panel) px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:gap-1">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={onOpenSpaces}
              className="rounded-full border border-(--border) px-3 py-1.5 text-xs text-(--muted) transition hover:text-(--accent)"
            >
              Пространства
            </button>
            <button
              type="button"
              onClick={onOpenChannels}
              className="rounded-full border border-(--border) px-3 py-1.5 text-xs text-(--muted) transition hover:text-(--accent)"
            >
              Каналы
            </button>
            <button
              type="button"
              onClick={onOpenVoice}
              className="rounded-full border border-(--border) px-3 py-1.5 text-xs text-(--muted) transition hover:text-(--accent)"
            >
              Участники
            </button>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
            Текстовый канал
          </p>
          <h3 className="mt-1 text-lg font-semibold">{channelTitle}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Пригласить
          </button>
          <button className="rounded-full border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Поиск
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6">
          {canLoadOlder ? (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                onClick={() => void onLoadOlder?.()}
                disabled={loadingOlder}
                className="rounded-full border border-(--border) px-3 py-1.5 text-xs text-(--muted) transition hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingOlder ? "Загрузка..." : "Показать более ранние"}
              </button>
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-(--muted)">Загрузка сообщений...</p>
          ) : messages.length ? (
            <div className="flex flex-col gap-6">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--panel-2) text-sm font-semibold">
                    {message.author.slice(0, 1)}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{message.author}</span>
                      <span className="text-xs text-(--subtle)">
                        {message.time}
                      </span>
                      {message.status === "sending" ? (
                        <span className="rounded-full border border-(--border) px-2 py-0.5 text-[11px] text-(--subtle)">
                          Отправка...
                        </span>
                      ) : null}
                      {message.status === "failed" ? (
                        <span className="rounded-full border border-(--danger) px-2 py-0.5 text-[11px] text-(--danger)">
                          Ошибка
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-(--muted)">{message.text}</p>
                    {message.status === "failed" ? (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="text-(--danger)">
                          {message.error ?? "Не удалось отправить сообщение."}
                        </span>
                        <button
                          type="button"
                          onClick={() => void onRetryMessage?.(message.id)}
                          className="rounded-full border border-(--border) px-2 py-1 text-(--muted) transition hover:text-(--accent)"
                        >
                          Повторить
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--muted)">Сообщений пока нет.</p>
          )}
        </div>

        <div className="border-t border-(--border) bg-(--panel) px-6 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--bg-2) px-4 py-3">
            <button className="text-(--muted) transition hover:text-(--accent)">
              +
            </button>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                void handleSend();
              }}
              disabled={disabled || submitting}
              className="flex-1 bg-transparent text-sm text-(--text) outline-none placeholder:text-(--subtle)"
              placeholder={
                disabled ? "Выберите канал для чата..." : "Написать сообщение..."
              }
            />
            <button
              type="button"
              disabled={disabled || submitting}
              onClick={() => void handleSend()}
              className="text-(--muted) transition hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↵
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
