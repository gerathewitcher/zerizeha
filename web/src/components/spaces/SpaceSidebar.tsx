"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CreateChannelModal from "@/components/spaces/CreateChannelModal";
import { useMe } from "@/lib/me";
import type { VoiceMember } from "@/lib/api/generated/zerizeha-schemas";

type ChannelItem = {
  id: string;
  name: string;
};

type SpaceSidebarProps = {
  spaceId: string;
  spaceName: string;
  textChannels: ChannelItem[];
  voiceChannels: ChannelItem[];
  voiceMembersByChannelId?: Record<string, VoiceMember[]>;
  activeVoiceChannelId?: string | null;
  speakingByUserId?: Record<string, boolean>;
  connectionQuality?: "good" | "ok" | "bad" | "unknown";
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSelectVoiceChannel?: (channelId: string) => void;
  onLeaveVoiceChannel?: () => void;
  onToggleChat?: () => void;
  chatOpen?: boolean;
  volumeByUserId?: Record<string, number>;
  onVolumeChange?: (userId: string, volume: number) => void;
  onChannelsChanged?: () => void;
};

export default function SpaceSidebar({
  spaceId,
  spaceName,
  textChannels,
  voiceChannels,
  voiceMembersByChannelId = {},
  activeVoiceChannelId,
  speakingByUserId,
  connectionQuality = "unknown",
  mobileOpen = false,
  onCloseMobile,
  onSelectVoiceChannel,
  onLeaveVoiceChannel,
  onToggleChat,
  chatOpen = true,
  volumeByUserId = {},
  onVolumeChange,
  onChannelsChanged,
}: SpaceSidebarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"text" | "voice">("text");
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const { state } = useMe();
  const me = state.status === "ready" ? state.me : null;
  const username = me?.username || "user";
  const initial = username.trim().slice(0, 1).toUpperCase() || "U";
  const isAdmin = !!me?.is_admin;

  useEffect(() => {
    if (!menuUserId) return;
    const close = () => setMenuUserId(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuUserId]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="Закрыть каналы"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={`w-72 flex-col border-r border-(--border) bg-(--panel) ${
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex"
            : "hidden"
        } md:static md:z-auto md:flex`}
      >
      <div className="border-b border-(--border) px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Пространство
            </p>
            <h2 className="mt-1 font-(--font-display) text-lg">{spaceName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/spaces/${spaceId}/settings`}
              className="rounded-full border border-(--border) px-2 py-1 text-xs text-(--muted) transition hover:text-(--accent)"
            >
              Настройки
            </Link>
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

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--subtle)">
            Текстовые
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
              onClick={() => {
                setCreateType("text");
                setCreateOpen(true);
              }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M8 3.5V12.5M3.5 8H12.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {textChannels.map((channel, index) => (
              <button
                key={channel.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  index === 0
                    ? "bg-(--bg-2) text-(--text)"
                    : "text-(--muted) hover:text-(--text)"
                }`}
              >
                <span className="text-(--subtle)">#</span>
                {channel.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--subtle)">
            Голосовые
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
              onClick={() => {
                setCreateType("voice");
                setCreateOpen(true);
              }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M8 3.5V12.5M3.5 8H12.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {voiceChannels.map((channel) => (
              <div key={channel.id} className="flex flex-col">
                <div
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    channel.id === activeVoiceChannelId
                      ? "bg-(--bg-2) text-(--text)"
                      : "text-(--muted) hover:text-(--text)"
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectVoiceChannel?.(channel.id)}
                  >
                    <span className="text-(--subtle)">🔊</span>
                    <span className="truncate">{channel.name}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {voiceMembersByChannelId[channel.id]?.length ? (
                      <span className="text-xs text-(--subtle)">
                        {voiceMembersByChannelId[channel.id].length}
                      </span>
                    ) : null}
                    {activeVoiceChannelId === channel.id && (
                      <>
                        <button
                          className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs transition ${
                            chatOpen
                              ? "border-(--accent) text-(--accent)"
                              : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                          }`}
                          aria-label="Открыть чат"
                          title="Открыть чат"
                          onClick={onToggleChat}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 4.5C3 3.7 3.7 3 4.5 3H11.5C12.3 3 13 3.7 13 4.5V9.5C13 10.3 12.3 11 11.5 11H7L4 13V4.5Z"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-(--border) text-xs text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
                          aria-label="Покинуть канал"
                          title="Покинуть канал"
                          onClick={onLeaveVoiceChannel}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M6 3H10C11.1 3 12 3.9 12 5V11C12 12.1 11.1 13 10 13H6"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M4.5 8H11"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                            <path
                              d="M8.5 6L11 8L8.5 10"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {voiceMembersByChannelId[channel.id]?.length ? (
                  <div className="mt-1 space-y-1 pl-7 text-xs text-(--subtle)">
                    {voiceMembersByChannelId[channel.id].map((member) => (
                      <div
                        key={member.id}
                        className="relative flex items-center gap-2"
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          if (member.id === me?.id) return;
                          setMenuUserId(member.id);
                        }}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            speakingByUserId?.[member.id]
                              ? "bg-(--accent) animate-[pulse_0.8s_ease-in-out_infinite]"
                              : "bg-(--border)"
                          }`}
                        />
                        <span className="truncate">{member.username}</span>
                        {member.is_admin ? (
                          <span className="text-(--accent)" title="Админ">
                            ★
                          </span>
                        ) : null}
                        {member.id !== me?.id ? (
                          <button
                            type="button"
                            className="ml-auto flex h-5 w-5 items-center justify-center rounded border border-(--border) text-[10px] text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
                            title="Громкость"
                            aria-label="Громкость"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setMenuUserId(member.id);
                            }}
                          >
                            <svg
                              className="h-3 w-3"
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
                        ) : null}
                        {menuUserId === member.id ? (
                          <div
                            className="absolute left-0 top-full z-50 mt-2 w-40 rounded-lg border border-(--border) bg-(--panel) p-2 text-[11px] shadow-xl"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-(--subtle)">
                              {member.username}
                            </p>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={volumeByUserId[member.id] ?? 1}
                              onChange={(ev) =>
                                onVolumeChange?.(
                                  member.id,
                                  Number(ev.currentTarget.value),
                                )
                              }
                              className="mt-2 w-full accent-(--accent)"
                            />
                            <div className="mt-1 text-[10px] text-(--muted)">
                              {Math.round((volumeByUserId[member.id] ?? 1) * 100)}%
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-(--border) px-4 py-4">
        <div className="flex items-center gap-3">
          {state.status === "loading" ? (
            <div className="flex w-full items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-xl bg-(--bg-2)" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-(--bg-2)" />
                <div className="h-3 w-40 animate-pulse rounded bg-(--bg-2)" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--bg-2) text-sm font-semibold">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{username}</p>
                  {isAdmin ? (
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
                <p className="truncate text-xs text-(--subtle)">
                  {isAdmin ? "admin" : "user"}
                </p>
                {activeVoiceChannelId ? (
                  <div className="flex items-center gap-2 text-[11px] text-(--muted)">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        connectionQuality === "good"
                          ? "bg-green-400"
                          : connectionQuality === "ok"
                            ? "bg-amber-400"
                            : connectionQuality === "bad"
                              ? "bg-red-400"
                              : "bg-(--border)"
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      Связь:{" "}
                      {connectionQuality === "good"
                        ? "хорошая"
                        : connectionQuality === "ok"
                          ? "нормальная"
                          : connectionQuality === "bad"
                            ? "плохая"
                            : "—"}
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
      <CreateChannelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        channelType={createType}
        spaceId={spaceId}
        onCreated={onChannelsChanged}
      />
      </aside>
    </>
  );
}
