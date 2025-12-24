type ChatMessage = {
  id: string;
  author: string;
  time: string;
  text: string;
};

type ChatPanelProps = {
  channelTitle: string;
  messages: ChatMessage[];
  onOpenSpaces?: () => void;
  onOpenChannels?: () => void;
  onOpenVoice?: () => void;
};

export default function ChatPanel({
  channelTitle,
  messages,
  onOpenSpaces,
  onOpenChannels,
  onOpenVoice,
}: ChatPanelProps) {
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
        <div className="flex-1 overflow-y-auto px-6 py-6">
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
                  </div>
                  <p className="mt-1 text-sm text-(--muted)">{message.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-(--border) bg-(--panel) px-6 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-(--border) bg-(--bg-2) px-4 py-3">
            <button className="text-(--muted) transition hover:text-(--accent)">
              +
            </button>
            <input
              className="flex-1 bg-transparent text-sm text-(--text) outline-none placeholder:text-(--subtle)"
              placeholder="Написать сообщение..."
            />
            <button className="text-(--muted) transition hover:text-(--accent)">
              ↵
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
