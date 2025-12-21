"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ChatPanel from "@/components/spaces/ChatPanel";
import SpaceRail from "@/components/spaces/SpaceRail";
import SpaceSidebar from "@/components/spaces/SpaceSidebar";
import VoicePanel from "@/components/spaces/VoicePanel";
import ErrorState from "@/components/ui/ErrorState";
import { fetchChannelsBySpaceId } from "@/lib/api/channels";
import { getHttpStatus } from "@/lib/api/errors";
import { fetchSpaceById, fetchSpaces } from "@/lib/api/spaces";
import { messages, voicePresence } from "@/lib/mock";
import type { Channel, Space } from "@/lib/api/generated/zerizeha-schemas";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; serverError: boolean }
  | {
      status: "ready";
      spaces: Space[];
      space: Space;
      channels: Channel[];
    };

export default function SpacePage() {
  const params = useParams<{ spaceId?: string | string[] }>();
  const spaceId =
    typeof params.spaceId === "string"
      ? params.spaceId
      : params.spaceId?.[0] ?? "";
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    if (!spaceId) return;
    const controller = new AbortController();

    Promise.all([
      fetchSpaces(controller.signal),
      fetchSpaceById(spaceId, controller.signal),
      fetchChannelsBySpaceId(spaceId, controller.signal),
    ])
      .then(([spaces, space, channels]) => {
        setState({ status: "ready", spaces, space, channels });
      })
      .catch((err) => {
        console.error("Failed to load space view", err);
        const status = getHttpStatus(err);
        if (status === 401) {
          window.location.assign("/login");
          return;
        }
        setState({
          status: "error",
          serverError: typeof status === "number" && status >= 500,
          message:
            typeof status === "number" && status >= 500
              ? "Сервер временно недоступен. Попробуйте повторить позже."
              : "Не удалось загрузить пространство. Попробуйте обновить.",
        });
      });

    return () => controller.abort();
  }, [spaceId]);

  const presence = useMemo(() => voicePresence, []);
  const chatMessages = useMemo(() => messages, []);

  const railSpaces = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.spaces.map((space) => ({ id: space.id, name: space.name }));
  }, [state]);

  const { textChannels, voiceChannels } = useMemo(() => {
    if (state.status !== "ready") return { textChannels: [], voiceChannels: [] };
    const textChannels = state.channels
      .filter((channel) => channel.channel_type === "text")
      .map((channel) => channel.name);
    const voiceChannels = state.channels
      .filter((channel) => channel.channel_type === "voice")
      .map((channel) => channel.name);
    return { textChannels, voiceChannels };
  }, [state]);

  const activeVoiceChannel = voiceChannels[0];

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <div className="flex h-screen overflow-hidden">
        <SpaceRail spaces={railSpaces} />
        {state.status === "ready" ? (
          <>
            <SpaceSidebar
              spaceId={state.space.id}
              spaceName={state.space.name}
              textChannels={textChannels}
              voiceChannels={voiceChannels}
              voicePresence={presence}
              activeVoiceChannel={activeVoiceChannel}
            />
            <ChatPanel
              channelTitle={textChannels[0] ? `# ${textChannels[0]}` : "#"}
              messages={chatMessages}
            />
            <VoicePanel users={presence[activeVoiceChannel] ?? []} />
          </>
        ) : state.status === "error" ? (
          <main className="flex min-w-0 flex-1 items-center justify-center px-6">
            <ErrorState
              title={state.serverError ? "Сервис недоступен" : "Ошибка"}
              message={state.message}
              onAction={() => window.location.reload()}
            />
          </main>
        ) : (
          <main className="flex min-w-0 flex-1 items-center justify-center px-6">
            <p className="text-sm text-(--muted)">Загрузка…</p>
          </main>
        )}
      </div>
    </div>
  );
}
