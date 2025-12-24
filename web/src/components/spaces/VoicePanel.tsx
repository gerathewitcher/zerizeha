import { useEffect, useMemo, useRef, useState } from "react";

type VoicePanelProps = {
  users: { id: string; username: string; is_admin: boolean }[];
  roomName?: string;
  onLeave?: () => void;
  speakingByUserId?: Record<string, boolean>;
  selfUserId?: string | null;
  screenShareEnabled?: boolean;
  onToggleScreenShare?: () => void;
  localScreenStream?: MediaStream | null;
  screenShares?: { feedId: string; userId: string }[];
  screenStreamsByFeedId?: Record<string, MediaStream>;
  selectedScreenFeedId?: string | null;
  onWatchScreen?: (feedId: string) => void;
  onLeaveScreen?: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  focusedUserId?: string | null;
  onFocusUser?: (userId: string | null) => void;
  volumeByUserId?: Record<string, number>;
  onVolumeChange?: (userId: string, volume: number) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

function StreamVideo({
  stream,
  muted = true,
  className,
}: {
  stream: MediaStream;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.muted = muted;
    const p = el.play();
    if (p) p.catch(() => {});
  }, [stream, muted]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

export default function VoicePanel({
  users,
  roomName,
  onLeave,
  speakingByUserId,
  selfUserId,
  screenShareEnabled,
  onToggleScreenShare,
  localScreenStream,
  screenShares = [],
  screenStreamsByFeedId = {},
  selectedScreenFeedId,
  onWatchScreen,
  onLeaveScreen,
  expanded = false,
  onToggleExpanded,
  focusedUserId,
  onFocusUser,
  volumeByUserId = {},
  onVolumeChange,
  mobileOpen = false,
  onCloseMobile,
}: VoicePanelProps) {
  const canToggleScreen = !!roomName && !!onToggleScreenShare;
  const [menu, setMenu] = useState<{ userId: string; x: number; y: number } | null>(
    null,
  );

  const screenShareList = useMemo(() => {
    const list = [...screenShares];
    if (localScreenStream && selfUserId) {
      const exists = list.some((s) => s.userId === selfUserId);
      if (!exists) list.unshift({ feedId: "local", userId: selfUserId });
    }
    return list;
  }, [screenShares, localScreenStream, selfUserId]);

  const screenShareByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const share of screenShareList) {
      map.set(share.userId, share.feedId);
    }
    return map;
  }, [screenShareList]);

  useEffect(() => {
    if (!screenShares.length && !localScreenStream && selectedScreenFeedId) {
      onLeaveScreen?.();
    }
  }, [screenShares.length, localScreenStream, selectedScreenFeedId, onLeaveScreen]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 xl:hidden"
          aria-label="Закрыть участников"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={`flex-col border-l border-(--border) bg-(--panel) ${
          mobileOpen
            ? "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px]"
            : expanded
              ? "hidden md:flex md:flex-1"
              : "hidden md:flex md:w-80"
        } xl:static xl:z-auto`}
      >
        <div className="border-b border-(--border) px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                Голосовая
              </p>
              <h3 className="mt-2 text-lg font-semibold">
                {roomName || "Не подключено"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {onToggleExpanded ? (
                <button
                  type="button"
                  className={`rounded-full border px-2 py-1 text-xs transition ${
                    expanded
                      ? "border-(--accent) text-(--accent)"
                      : "border-(--border) text-(--muted) hover:text-(--accent)"
                  }`}
                  onClick={onToggleExpanded}
                  title={expanded ? "Свернуть" : "Расширить"}
                >
                  {expanded ? "Свернуть" : "Расширить"}
                </button>
              ) : null}
              {mobileOpen ? (
                <button
                  type="button"
                  className="rounded-full border border-(--border) px-2 py-1 text-xs text-(--muted) transition hover:text-(--accent)"
                  onClick={onCloseMobile}
                >
                  Закрыть
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {expanded ? (
            <div
              className="grid gap-5"
              style={{
                gridTemplateColumns:
                  users.length <= 3
                    ? `repeat(${Math.max(users.length, 1)}, minmax(0, 1fr))`
                    : "repeat(auto-fit, minmax(240px, 1fr))",
              }}
            >
              {users.length ? (
                users.map((user) => {
                  const speaking = !!speakingByUserId?.[user.id];
                  const isSingle = users.length === 1;
                  const feedId = screenShareByUserId.get(user.id) ?? null;
                  const isSharing = !!feedId;
                  const isWatching =
                    !!feedId && selectedScreenFeedId === feedId;
                  const screenStream =
                    feedId === "local"
                      ? localScreenStream
                      : feedId
                        ? screenStreamsByFeedId[feedId]
                        : null;
                  const handleTileClick = () => {
                    if (!feedId) {
                      onFocusUser?.(user.id);
                      return;
                    }
                    if (selectedScreenFeedId === feedId) {
                      onLeaveScreen?.();
                      return;
                    }
                    onWatchScreen?.(feedId);
                  };

                  const isFocused = focusedUserId === user.id;
                  return (
                    <div
                      key={user.id}
                      className={`relative overflow-hidden rounded-3xl border bg-(--panel-2) ${
                        speaking || isFocused
                          ? "border-(--accent)"
                          : "border-(--border)"
                      } ${isSingle ? "mx-auto w-full max-w-[900px]" : ""}`}
                      style={{ aspectRatio: "4 / 3" }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        if (user.id === selfUserId) return;
                        setMenu({ userId: user.id, x: ev.clientX, y: ev.clientY });
                      }}
                    >
                      {isWatching && screenStream ? (
                        <StreamVideo
                          stream={screenStream}
                          muted
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className={`absolute inset-0 ${
                            isSharing ? "blur-[6px] brightness-[0.75]" : ""
                          }`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center bg-(--bg-2) text-xl font-semibold">
                            {user.username.slice(0, 1).toUpperCase()}
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/45 px-4 py-3 text-sm text-white">
                        <span className="truncate">{user.username}</span>
                        {user.is_admin ? <span className="text-xs">★</span> : null}
                      </div>

                      {isSharing && !isWatching ? (
                        <button
                          type="button"
                          onClick={handleTileClick}
                          className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white"
                        >
                          <span className="rounded-xl border border-white/40 bg-black/50 px-4 py-2">
                            Смотреть эфир
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleTileClick}
                          className="absolute inset-0"
                          aria-label="Выбрать плиту"
                        />
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full text-sm text-(--muted)">
                  {roomName ? "Пока никого нет." : "Выбери голосовой канал."}
                </div>
              )}
            </div>
          ) : (
            <>
              {users.length ? (
                <div className="flex flex-col gap-4">
                  {users.map((user) => {
                    const speaking = !!speakingByUserId?.[user.id];
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between rounded-xl border bg-(--panel-2) px-4 py-3 ${
                        speaking
                          ? "border-(--accent) shadow-[0_0_0_2px_rgba(99,102,241,0.15)]"
                          : "border-(--border)"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2) text-sm font-semibold">
                            {user.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {user.username}
                            </p>
                            {user.is_admin ? (
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-(--border) bg-(--bg-2) text-(--accent)"
                                title="Админ"
                                aria-label="Админ"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  viewBox="0 0 16 16"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M3 6.2L5.2 8.1L8 4.2L10.8 8.1L13 6.2V11.5C13 12.3 12.3 13 11.5 13H4.5C3.7 13 3 12.3 3 11.5V6.2Z"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M5 12.2H11"
                                    stroke="currentColor"
                                    strokeWidth="1.2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-(--subtle)">в канале</p>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              ) : (
                <p className="text-sm text-(--muted)">
                  {roomName ? "Пока никого нет." : "Выбери голосовой канал."}
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-(--border) px-6 py-5">
          <div className="grid grid-cols-3 gap-2">
            <button className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
              Mute
            </button>
            <button
              type="button"
              onClick={onToggleScreenShare}
              disabled={!canToggleScreen}
              className={`rounded-xl border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                screenShareEnabled
                  ? "border-(--accent) text-(--accent)"
                  : "border-(--border) text-(--muted) hover:text-(--accent)"
              }`}
            >
              Screen
            </button>
            <button
              type="button"
              onClick={onLeave}
              disabled={!onLeave || !roomName}
              className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Leave
            </button>
          </div>
        </div>
      </aside>
      {menu ? (
        <div
          className="fixed z-50 w-56 rounded-xl border border-(--border) bg-(--panel) p-3 text-xs shadow-xl"
          style={{ left: menu.x + 8, top: menu.y + 8 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-(--subtle)">
            Громкость
          </p>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeByUserId[menu.userId] ?? 1}
            onChange={(ev) =>
              onVolumeChange?.(menu.userId, Number(ev.currentTarget.value))
            }
            className="w-full accent-(--accent)"
          />
          <div className="mt-2 text-[11px] text-(--muted)">
            {Math.round((volumeByUserId[menu.userId] ?? 1) * 100)}%
          </div>
        </div>
      ) : null}
    </>
  );
}
