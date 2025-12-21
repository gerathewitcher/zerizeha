type VoicePanelProps = {
  users: string[];
  roomName?: string;
};

export default function VoicePanel({
  users,
  roomName = "Комната 01",
}: VoicePanelProps) {
  return (
    <aside className="hidden w-80 flex-col border-l border-(--border) bg-(--panel) xl:flex">
      <div className="border-b border-(--border) px-6 py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
          Голосовая
        </p>
        <h3 className="mt-2 text-lg font-semibold">{roomName}</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-4">
          {users.map((user) => (
            <div
              key={user}
              className="flex items-center justify-between rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2) text-sm font-semibold">
                  {user.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{user}</p>
                  <p className="text-xs text-(--subtle)">говорит</p>
                </div>
              </div>
              <div className="h-2 w-16 rounded-full bg-(--bg-2)">
                <div className="h-full w-10 rounded-full bg-(--accent)" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-(--border) px-6 py-5">
        <div className="grid grid-cols-3 gap-2">
          <button className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Mute
          </button>
          <button className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Deaf
          </button>
          <button className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Leave
          </button>
        </div>
      </div>
    </aside>
  );
}
