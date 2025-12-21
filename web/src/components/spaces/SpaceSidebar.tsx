"use client";

import Link from "next/link";
import { useState } from "react";
import CreateChannelModal from "@/components/spaces/CreateChannelModal";

type SpaceSidebarProps = {
  spaceId: string;
  spaceName: string;
  textChannels: string[];
  voiceChannels: string[];
  voicePresence?: Record<string, string[]>;
  activeVoiceChannel?: string;
};

export default function SpaceSidebar({
  spaceId,
  spaceName,
  textChannels,
  voiceChannels,
  voicePresence = {},
  activeVoiceChannel,
}: SpaceSidebarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"text" | "voice">("text");

  return (
    <aside className="hidden w-72 flex-col border-r border-(--border) bg-(--panel) md:flex">
      <div className="border-b border-(--border) px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Пространство
            </p>
            <h2 className="mt-1 font-(--font-display) text-lg">{spaceName}</h2>
          </div>
          <Link
            href={`/spaces/${spaceId}/settings`}
            className="rounded-full border border-(--border) px-2 py-1 text-xs text-(--muted) transition hover:text-(--accent)"
          >
            Настройки
          </Link>
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
                key={channel}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  index === 0
                    ? "bg-(--bg-2) text-(--text)"
                    : "text-(--muted) hover:text-(--text)"
                }`}
              >
                <span className="text-(--subtle)">#</span>
                {channel}
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
            {voiceChannels.map((channel, index) => (
              <div key={channel} className="flex flex-col">
                <div
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    index === 0
                      ? "bg-(--bg-2) text-(--text)"
                      : "text-(--muted) hover:text-(--text)"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-(--subtle)">🔊</span>
                    {channel}
                  </span>
                  <div className="flex items-center gap-2">
                    {!!voicePresence[channel]?.length && (
                      <span className="text-xs text-(--subtle)">
                        {voicePresence[channel].length}
                      </span>
                    )}
                    {activeVoiceChannel === channel && (
                      <button
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-(--border) text-xs text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
                        aria-label="Покинуть канал"
                        title="Покинуть канал"
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
                    )}
                  </div>
                </div>
                {voicePresence[channel]?.length ? (
                  <div className="mt-1 space-y-1 pl-7 text-xs text-(--subtle)">
                    {voicePresence[channel].map((user) => (
                      <div key={user} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
                        {user}
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--bg-2)">
            G
          </div>
          <div>
            <p className="text-sm font-medium">gera</p>
            <p className="text-xs text-(--subtle)">admin</p>
          </div>
        </div>
      </div>
      <CreateChannelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        channelType={createType}
      />
    </aside>
  );
}
