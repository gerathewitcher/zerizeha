import { useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/ui/Tooltip";

type VoicePanelProps = {
  users: {
    id: string;
    username: string;
    is_admin: boolean;
    muted?: boolean;
    deafened?: boolean;
  }[];
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
  micMuted?: boolean;
  onToggleMute?: () => void;
  incomingMuted?: boolean;
  onToggleIncomingMute?: () => void;
  mutedUserIds?: Record<string, boolean>;
  onToggleUserMute?: (userId: string) => void;
  controlsEnabled?: boolean;
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
  micMuted = false,
  onToggleMute,
  incomingMuted = false,
  onToggleIncomingMute,
  mutedUserIds = {},
  onToggleUserMute,
  controlsEnabled = true,
}: VoicePanelProps) {
  const canToggleScreen = !!roomName && !!onToggleScreenShare;
  const [volumeUserId, setVolumeUserId] = useState<string | null>(null);
  const [pendingWatchFeedId, setPendingWatchFeedId] = useState<string | null>(null);
  const [watchErrorFeedId, setWatchErrorFeedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<
    | null
    | {
        userId: string;
        feedId: string | null;
        local: boolean;
      }
  >(null);

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
    if (!volumeUserId) return;
    const close = () => setVolumeUserId(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [volumeUserId]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setFullscreen(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  useEffect(() => {
    if (!pendingWatchFeedId) return;
    const streamReady = screenStreamsByFeedId?.[pendingWatchFeedId];
    if (streamReady) {
      setPendingWatchFeedId(null);
      return;
    }
    if (selectedScreenFeedId !== pendingWatchFeedId) {
      setPendingWatchFeedId(null);
    }
  }, [pendingWatchFeedId, screenStreamsByFeedId, selectedScreenFeedId]);

  useEffect(() => {
    if (!pendingWatchFeedId) return;
    const timeoutId = window.setTimeout(() => {
      setPendingWatchFeedId(null);
      setWatchErrorFeedId(pendingWatchFeedId);
      if (selectedScreenFeedId === pendingWatchFeedId) {
        onLeaveScreen?.();
      }
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingWatchFeedId, onLeaveScreen, selectedScreenFeedId]);

  useEffect(() => {
    if (!watchErrorFeedId) return;
    const timeoutId = window.setTimeout(() => {
      setWatchErrorFeedId(null);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [watchErrorFeedId]);

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
	                  const isLocalShare = user.id === selfUserId && !!localScreenStream;
                  const isWatching = !!feedId && selectedScreenFeedId === feedId;
                  const screenStream = isLocalShare
                    ? localScreenStream
                    : feedId
                      ? screenStreamsByFeedId[feedId]
                      : null;
                  const showScreen = !!screenStream && (isLocalShare || isWatching);
                  const showWatchButton = !!feedId && isSharing && !showScreen && !isLocalShare;
                  const isPendingWatch = !!feedId && pendingWatchFeedId === feedId;
                  const handleTileClick = () => {
                    if (isLocalShare) {
                      setFullscreen({
                        userId: user.id,
                        feedId: "local",
	                        local: true,
	                      });
	                      return;
	                    }
                    if (!feedId) {
                      onFocusUser?.(user.id);
                      return;
                    }
                    if (selectedScreenFeedId === feedId) {
                      setPendingWatchFeedId(null);
                      onLeaveScreen?.();
                      return;
                    }
                    setWatchErrorFeedId(null);
                    setPendingWatchFeedId(feedId);
                    onWatchScreen?.(feedId);
                  };

	                  const handleFullscreen = (ev: any) => {
	                    ev.preventDefault();
	                    ev.stopPropagation();
	                    if (!screenStream) return;
	                    setFullscreen({ userId: user.id, feedId, local: isLocalShare });
	                  };

	                  const isFocused = focusedUserId === user.id;
	                  const isSelf = user.id === selfUserId;
	                  const isMutedLocally = !!mutedUserIds[user.id];
	                  const showUserMute = !isSelf && onToggleUserMute;
	                  const showMuted = user.muted === true;
	                  const showDeafened = user.deafened === true;
	                  return (
	                    <div
	                      key={user.id}
                      className={`group relative overflow-hidden rounded-3xl border bg-(--panel-2) ${
                        speaking || isFocused
                          ? "border-(--accent)"
                          : "border-(--border)"
                      } ${isSingle ? "mx-auto w-full max-w-[720px]" : ""}`}
                      style={{ aspectRatio: "4 / 3" }}
	                    >
	                      {showScreen && screenStream ? (
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

                        {(showMuted || showDeafened) && (
                          <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
                            {showMuted ? (
                              <Tooltip label="Микрофон выключен">
                                <span className="rounded-full border border-red-500/40 bg-red-500/10 p-1.5 text-red-300">
                                  <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M6 6.5V4.5C6 3.7 6.7 3 7.5 3C8.3 3 9 3.7 9 4.5V6.5"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M5 7.5C5 8.9 6.1 10 7.5 10C8.9 10 10 8.9 10 7.5V6.8"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M4 13H11"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M7.5 10V13"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M3 3L13 13"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </span>
                              </Tooltip>
                            ) : null}
                            {showDeafened ? (
                              <Tooltip label="Звук выключен">
                                <span className="rounded-full border border-red-500/40 bg-red-500/10 p-1.5 text-red-300">
                                  <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M6 4.5L4.2 6H3V10H4.2L6 11.5V4.5Z"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M11 5.5C12 6.5 12 9.5 11 10.5"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M3 3L13 13"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </span>
                              </Tooltip>
                            ) : null}
                          </div>
                        )}

                      <div className="absolute inset-x-0 bottom-0 z-20 bg-black/45 px-4 py-3 text-sm text-white">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                          <span className="truncate">{user.username}</span>
                          <div className="relative flex items-center gap-2">
                            {showUserMute ? (
                              <Tooltip
                                label={isMutedLocally ? "Снять заглушение" : "Заглушить"}
                              >
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    onToggleUserMute?.(user.id);
                                  }}
                                  disabled={!controlsEnabled}
                                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                                    isMutedLocally
                                      ? "border-red-500/50 bg-red-500/20 text-red-200"
                                      : "border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/55"
                                  }`}
                                  aria-label={isMutedLocally ? "Снять заглушение" : "Заглушить"}
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M8 3.2C8.9 3.2 9.6 3.9 9.6 4.8V8.2C9.6 9.1 8.9 9.8 8 9.8C7.1 9.8 6.4 9.1 6.4 8.2V4.8C6.4 3.9 7.1 3.2 8 3.2Z"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                    />
                                    <path
                                      d="M11 7.4V8.3C11 10.1 9.7 11.6 8 11.6C6.3 11.6 5 10.1 5 8.3V7.4"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M6.5 11.6V13"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    <path
                                      d="M5 13H11"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                    {isMutedLocally ? (
                                      <path
                                        d="M2 2L12 12"
                                        stroke="currentColor"
                                        strokeWidth="1.2"
                                        strokeLinecap="round"
                                      />
                                    ) : null}
                                  </svg>
                                </button>
                              </Tooltip>
                            ) : null}
                            {!isSelf && onVolumeChange ? (
                              <Tooltip label="Громкость">
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setVolumeUserId(user.id);
                                  }}
                                  disabled={!controlsEnabled}
                                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur transition hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-60"
                                  aria-label="Громкость"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    aria-hidden="true"
                                  >
                                    <path
                                      d="M3 6.5H5.5L8.5 4V12L5.5 9.5H3V6.5Z"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinejoin="round"
                                    />
                                    <path
                                      d="M11 6.2C11.7 7 11.7 9 11 9.8"
                                      stroke="currentColor"
                                      strokeWidth="1.2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              </Tooltip>
                            ) : null}
                            {volumeUserId === user.id ? (
                              <div
                                className="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-xl border border-(--border) bg-(--panel) p-3 text-xs shadow-xl"
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
                                  value={volumeByUserId[user.id] ?? 1}
                                  onChange={(ev) =>
                                    onVolumeChange?.(user.id, Number(ev.currentTarget.value))
                                  }
                                  className="w-full accent-(--accent)"
                                />
                                <div className="mt-2 text-[11px] text-(--muted)">
                                  {Math.round((volumeByUserId[user.id] ?? 1) * 100)}%
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <span className="justify-self-end text-xs">
                            {user.is_admin ? "★" : ""}
                          </span>
                        </div>
                      </div>

                      {showScreen && screenStream ? (
                        <span className="absolute right-3 top-3 z-20">
                          <Tooltip label="На весь экран" side="right">
                            <button
                              type="button"
                              onClick={handleFullscreen}
                              className="rounded-full border border-white/20 bg-black/45 p-2 text-white backdrop-blur transition hover:bg-black/55"
                              aria-label="На весь экран"
                            >
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path
                                d="M7 3H4.5C3.7 3 3 3.7 3 4.5V7"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M13 3H15.5C16.3 3 17 3.7 17 4.5V7"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M7 17H4.5C3.7 17 3 16.3 3 15.5V13"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M13 17H15.5C16.3 17 17 16.3 17 15.5V13"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            </button>
                          </Tooltip>
                        </span>
                      ) : null}

	                      {showWatchButton && controlsEnabled ? (
	                        <button
	                          type="button"
	                          onClick={handleTileClick}
	                          className="absolute inset-0 z-10 flex items-center justify-center text-sm font-semibold text-white"
	                        >
	                          {isPendingWatch ? (
	                            <span className="flex items-center gap-2 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em]">
	                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
	                              Подключение…
	                            </span>
	                          ) : watchErrorFeedId === feedId ? (
	                            <span className="rounded-xl border border-red-400/60 bg-red-500/20 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-red-100">
	                              Не удалось подключиться
	                            </span>
	                          ) : (
	                            <span className="rounded-xl border border-white/40 bg-black/50 px-4 py-2">
	                              Смотреть эфир
	                            </span>
	                          )}
	                        </button>
	                      ) : (
	                        <button
	                          type="button"
	                          onClick={handleTileClick}
	                          className="absolute inset-0 z-10"
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
                              <Tooltip label="Админ">
                                <span
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-(--border) bg-(--bg-2) text-(--accent)"
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
                              </Tooltip>
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
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Tooltip label={micMuted ? "Включить микрофон" : "Выключить микрофон"}>
              <button
                type="button"
                onClick={onToggleMute}
                disabled={!controlsEnabled || !onToggleMute}
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl border text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  micMuted
                    ? "border-(--danger) text-(--danger)"
                    : "border-(--border) text-(--muted) hover:text-(--accent)"
                }`}
                aria-label="Микрофон"
              >
                <svg
                  className="h-7 w-7"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M8 3.2C8.9 3.2 9.6 3.9 9.6 4.8V8.2C9.6 9.1 8.9 9.8 8 9.8C7.1 9.8 6.4 9.1 6.4 8.2V4.8C6.4 3.9 7.1 3.2 8 3.2Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M11 7.4V8.3C11 10.1 9.7 11.6 8 11.6C6.3 11.6 5 10.1 5 8.3V7.4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path d="M8 11.6V13.2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.3 13.2H9.7" stroke="currentColor" strokeWidth="1.2" />
                  {micMuted ? (
                    <path
                      d="M4 4L12 12"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  ) : null}
                </svg>
              </button>
            </Tooltip>

            <Tooltip label={incomingMuted ? "Включить звук" : "Выключить звук"}>
              <button
                type="button"
                onClick={onToggleIncomingMute}
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl border text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  incomingMuted
                    ? "border-(--danger) text-(--danger)"
                    : "border-(--border) text-(--muted) hover:text-(--accent)"
                }`}
                disabled={!controlsEnabled || !onToggleIncomingMute}
                aria-label="Входящий звук"
              >
                <svg
                  className="h-7 w-7"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M6 4.5L4.2 6H3V10H4.2L6 11.5V4.5Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M11 5.5C12 6.5 12 9.5 11 10.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  {incomingMuted ? (
                    <path
                      d="M3 3L13 13"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  ) : null}
                </svg>
              </button>
            </Tooltip>

            <Tooltip
              label={screenShareEnabled ? "Остановить экран" : "Показать экран"}
            >
              <button
                type="button"
                onClick={onToggleScreenShare}
                disabled={!controlsEnabled || !canToggleScreen}
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-xl border text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  screenShareEnabled
                    ? "border-(--accent) text-(--accent)"
                    : "border-(--border) text-(--muted) hover:text-(--accent)"
                }`}
                aria-label="Показ экрана"
              >
                <svg
                  className="h-7 w-7"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect
                    x="2.5"
                    y="3.5"
                    width="11"
                    height="8"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M6 13H10"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </Tooltip>

            <Tooltip label="Отключиться">
              <button
                type="button"
                onClick={onLeave}
                disabled={!onLeave}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-(--danger) text-xs text-(--danger) transition hover:border-red-500/80 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Отключиться"
              >
                <svg
                  className="h-7 w-10"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <g transform="translate(-0.35 0) rotate(134 8 8)">
                    <path
                      d="M5.6 2.2L6.6 3.2C7 3.6 7 4.2 6.6 4.6L6 5.2C6.7 6.7 7.9 7.9 9.4 8.6L10 8C10.4 7.6 11 7.6 11.4 8L12.4 9C12.8 9.4 12.8 10 12.4 10.4L11.7 11.1C11.3 11.5 10.8 11.7 10.3 11.6C8.6 11.2 7 10.3 5.7 9C4.4 7.7 3.5 6.1 3.1 4.4C3 3.9 3.2 3.4 3.6 3L4.3 2.3C4.8 1.8 5.3 1.8 5.6 2.2Z"
                      fill="currentColor"
                    />
                  </g>
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>
      {fullscreen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/90"
          onClick={() => setFullscreen(null)}
          role="dialog"
          aria-label="Просмотр трансляции"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                Трансляция экрана
              </div>
              <div className="truncate text-xs text-white/70">
                {fullscreen.userId}
              </div>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
              onClick={(ev) => {
                ev.stopPropagation();
                setFullscreen(null);
              }}
            >
              Закрыть
            </button>
          </div>

          <div
            className="relative flex-1 px-4 pb-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            {(() => {
              const username =
                users.find((u) => u.id === fullscreen.userId)?.username ??
                fullscreen.userId;
              const isLocal = fullscreen.local;
              const stream = isLocal
                ? localScreenStream
                : fullscreen.feedId
                  ? screenStreamsByFeedId[fullscreen.feedId]
                  : null;
              if (!stream) {
                return (
                  <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
                    Загрузка трансляции…
                  </div>
                );
              }
              return (
                <div className="relative h-full w-full">
                  <StreamVideo
                    stream={stream}
                    muted
                    className="h-full w-full rounded-2xl object-contain"
                  />
                  <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-black/45 px-3 py-1.5 text-xs text-white">
                    {username}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </>
  );
}
