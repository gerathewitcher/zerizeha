"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ChatPanel from "@/components/spaces/ChatPanel";
import SpaceRail from "@/components/spaces/SpaceRail";
import SpaceSidebar from "@/components/spaces/SpaceSidebar";
import VoicePanel from "@/components/spaces/VoicePanel";
import { useVoiceSession } from "@/components/spaces/VoiceSessionProvider";
import ErrorState from "@/components/ui/ErrorState";
import { fetchChannelsBySpaceId } from "@/lib/api/channels";
import { logout } from "@/lib/api/auth";
import { getHttpStatus } from "@/lib/api/errors";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";
import { fetchSpaceById, fetchSpaces } from "@/lib/api/spaces";
import { useMe } from "@/lib/me";
import { messages } from "@/lib/mock";
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
  const meState = useMe();
  const params = useParams<{ spaceId?: string | string[] }>();
  const spaceId =
    typeof params.spaceId === "string"
      ? params.spaceId
      : params.spaceId?.[0] ?? "";
  const voiceSession = useVoiceSession();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const volumeByUserId = voiceSession.volumeByUserId;
  const mutedUserIds = voiceSession.mutedUserIds;
  const micMuted = voiceSession.micMuted;
  const incomingMuted = voiceSession.incomingMuted;
  const voicePanelExpanded = voiceSession.voicePanelExpanded;
  const voiceReady = voiceSession.voiceReady;
  const activeVoiceChannelId = voiceSession.activeVoiceChannelId;
  const voiceMembersByChannelId = voiceSession.voiceMembersByChannelId;
  const voiceSpeakingByUserId = voiceSession.voiceSpeakingByUserId;
  const voiceFatalError = voiceSession.voiceFatalError;
  const screenShareEnabled = voiceSession.screenShareEnabled;
  const localScreenStream = voiceSession.localScreenStream;
  const screenStreamsByFeedId = voiceSession.screenStreamsByFeedId;
  const screenShares = voiceSession.screenShares;
  const selectedScreenFeedId = voiceSession.selectedScreenFeedId;
  const focusedUserId = voiceSession.focusedUserId;


  useEffect(() => {
    if (!spaceId) return;
    const controller = new AbortController();

    Promise.all([
      fetchSpaces(controller.signal),
      fetchSpaceById(spaceId, controller.signal),
      fetchChannelsBySpaceId(spaceId, controller.signal),
    ])
      .then(([spaces, space, channels]) => {
        setState({
          status: "ready",
          spaces,
          space,
          channels,
        });
      })
      .catch((err) => {
        console.error("Failed to load space view", err);
        if (redirectIfAuthOrOnboardingError(err)) return;
        const status = getHttpStatus(err);
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
  }, [spaceId, reloadKey]);

  const chatMessages = useMemo(() => messages, []);

  const railSpaces = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.spaces.map((space) => ({ id: space.id, name: space.name }));
  }, [state]);

  const { textChannels, voiceChannels } = useMemo(() => {
    if (state.status !== "ready") return { textChannels: [], voiceChannels: [] };
    const textChannels = state.channels
      .filter((channel) => channel.channel_type === "text")
      .map((channel) => ({ id: channel.id, name: channel.name }));
    const voiceChannels = state.channels
      .filter((channel) => channel.channel_type === "voice")
      .map((channel) => ({ id: channel.id, name: channel.name }));
    return { textChannels, voiceChannels };
  }, [state]);

  const { setSpaceVoiceChannels } = voiceSession;
  useEffect(() => {
    if (state.status !== "ready") return;
    setSpaceVoiceChannels(
      state.space.id,
      voiceChannels.map((channel) => channel.id),
    );
    if (voiceSession.activeVoiceSpaceId === state.space.id) {
      voiceSession.setActiveVoiceSpaceName(state.space.name);
    }
  }, [
    state.status,
    state.status === "ready" ? state.space.id : "",
    voiceChannels,
    setSpaceVoiceChannels,
    voiceSession,
  ]);

  const activeVoiceChannelName = useMemo(() => {
    if (!activeVoiceChannelId) return "";
    if (
      voiceSession.activeVoiceSpaceId &&
      voiceSession.activeVoiceSpaceId !== spaceId
    ) {
      return voiceSession.activeVoiceChannelName || "Голосовой канал";
    }
    const found = voiceChannels.find((ch) => ch.id === activeVoiceChannelId);
    return found?.name ?? voiceSession.activeVoiceChannelName ?? "";
  }, [
    activeVoiceChannelId,
    spaceId,
    voiceChannels,
    voiceSession.activeVoiceChannelName,
    voiceSession.activeVoiceSpaceId,
  ]);

  const activeVoiceMembers = useMemo(() => {
    if (!activeVoiceChannelId) return [];
    return voiceMembersByChannelId[activeVoiceChannelId] ?? [];
  }, [activeVoiceChannelId, voiceMembersByChannelId]);

  const meSummary = voiceSession.meSummary;

  const handleSelectVoiceChannel = useCallback(
    async (channelId: string) => {
      if (!channelId) return;
      if (channelId === activeVoiceChannelId) return;
      setChatOpen(false);
      try {
        const channelName =
          voiceChannels.find((channel) => channel.id === channelId)?.name ?? "";
        const spaceName = state.status === "ready" ? state.space.name : "";
        await voiceSession.joinVoiceChannel(
          spaceId,
          channelId,
          channelName,
          spaceName,
        );
      } catch (err) {
        console.error("Failed to join voice channel", err);
        redirectIfAuthOrOnboardingError(err);
      }
    },
    [activeVoiceChannelId, spaceId, state, voiceChannels, voiceSession],
  );

  const handleLeaveVoiceChannel = useCallback(async () => {
    try {
      await voiceSession.leaveVoiceChannel();
    } catch (err) {
      console.error("Failed to leave voice channel", err);
      redirectIfAuthOrOnboardingError(err);
    } finally {
      setChatOpen(true);
    }
  }, [voiceSession]);

  const handleToggleExpanded = useCallback(() => {
    voiceSession.setVoicePanelExpanded(!voiceSession.voicePanelExpanded);
    if (!voiceSession.voicePanelExpanded) {
      setChatOpen(false);
    } else {
      setChatOpen(true);
    }
  }, [voiceSession]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (activeVoiceChannelId) {
        await handleLeaveVoiceChannel();
      }
      await logout();
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      window.location.assign("/login");
    }
  }, [loggingOut, activeVoiceChannelId, handleLeaveVoiceChannel]);

  const handleToggleChat = useCallback(() => {
    setChatOpen(true);
    voiceSession.setVoicePanelExpanded(false);
  }, [voiceSession]);

  useEffect(() => {
    if (voicePanelExpanded) setChatOpen(false);
  }, [voicePanelExpanded]);

  useEffect(() => {
    if (!activeVoiceChannelId) setChatOpen(true);
  }, [activeVoiceChannelId]);

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      {voiceFatalError ? (
        <div className="mx-auto mt-4 w-full max-w-6xl px-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <span>{voiceFatalError}</span>
            <button
              type="button"
              className="rounded-full border border-amber-500/30 px-3 py-1 text-xs text-amber-200 transition hover:border-amber-400"
              onClick={voiceSession.clearVoiceFatalError}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
      <div className="md:hidden">
        {state.status === "ready" ? (
          <main className="px-5 py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Пространство
                </p>
                <h1 className="mt-1 text-xl font-semibold">{state.space.name}</h1>
              </div>
              <Link
                href="/spaces"
                className="rounded-full border border-(--border) px-3 py-1.5 text-xs text-(--muted) transition hover:text-(--accent)"
              >
                Назад
              </Link>
            </div>

            <div className="mt-6 space-y-6">
              <section>
                <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Текстовые
                </p>
                <div className="mt-3 space-y-2">
                  {textChannels.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--panel) px-4 py-3 text-sm text-(--muted)"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-(--subtle)">#</span>
                        <span className="truncate">{channel.name}</span>
                      </div>
                      <span className="text-xs text-(--subtle)">Чат скрыт</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Голосовые
                </p>
                <div className="mt-3 space-y-2">
                  {voiceChannels.map((channel) => {
                    const memberCount =
                      voiceMembersByChannelId[channel.id]?.length ?? 0;
                    const members = voiceMembersByChannelId[channel.id] ?? [];
                    return (
                      <div key={channel.id} className="space-y-2">
                        <div
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
                            channel.id === activeVoiceChannelId
                              ? "border-(--accent) bg-(--bg-2) text-(--text)"
                              : "border-(--border) bg-(--panel) text-(--muted)"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            onClick={() => handleSelectVoiceChannel(channel.id)}
                          >
                            <span className="text-(--subtle)">🔊</span>
                            <span className="truncate">{channel.name}</span>
                          </button>
                          <div className="flex items-center gap-2 text-xs text-(--subtle)">
                            <span>{memberCount || "0"}</span>
                            {channel.id === activeVoiceChannelId ? (
                              <button
                                type="button"
                                onClick={handleLeaveVoiceChannel}
                                className="text-xs text-(--accent)"
                              >
                                Выйти
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {members.length ? (
                          <div className="space-y-1 pl-6 text-xs text-(--subtle)">
                            {members.map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center gap-2"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    voiceSpeakingByUserId[member.id]
                                      ? "bg-(--accent) animate-[pulse_0.8s_ease-in-out_infinite]"
                                      : "bg-(--border)"
                                  }`}
                                />
                                <span className="truncate">
                                  {member.username}
                                </span>
                                {member.is_admin ? (
                                  <span className="text-(--accent)" title="Админ">
                                    ★
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </main>
        ) : state.status === "error" ? (
          <main className="px-6 py-6">
            <ErrorState
              title={state.serverError ? "Сервис недоступен" : "Ошибка"}
              message={state.message}
              onAction={() => window.location.reload()}
            />
          </main>
        ) : (
          <main className="px-6 py-6">
            <p className="text-sm text-(--muted)">Загрузка…</p>
          </main>
        )}
      </div>

      <div className="hidden h-screen overflow-hidden md:flex">
        <SpaceRail
          spaces={railSpaces}
          isAdmin={meState.state.status === "ready" ? meState.state.me.is_admin : false}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          activeVoiceSpaceId={voiceSession.activeVoiceSpaceId}
        />
        {state.status === "ready" ? (
          <>
            <SpaceSidebar
              spaceId={state.space.id}
              spaceName={state.space.name}
              textChannels={textChannels}
              voiceChannels={voiceChannels}
              voiceMembersByChannelId={voiceMembersByChannelId}
              activeVoiceChannelId={activeVoiceChannelId}
              speakingByUserId={voiceSpeakingByUserId}
              onSelectVoiceChannel={handleSelectVoiceChannel}
              onLeaveVoiceChannel={handleLeaveVoiceChannel}
              onToggleChat={handleToggleChat}
              chatOpen={chatOpen}
              volumeByUserId={volumeByUserId}
              onVolumeChange={voiceSession.setVolume}
              onChannelsChanged={() => setReloadKey((v) => v + 1)}
              mutedUserIds={mutedUserIds}
              onToggleUserMute={voiceSession.toggleUserMute}
              canManageChannels={
                meState.state.status === "ready" &&
                (meState.state.me.is_admin ||
                  meState.state.me.id === state.space.author_id)
              }
              canManageSpace={
                meState.state.status === "ready" &&
                (meState.state.me.is_admin ||
                  meState.state.me.id === state.space.author_id)
              }
            />
            {chatOpen && !voicePanelExpanded ? (
              <ChatPanel
                channelTitle={textChannels[0] ? `# ${textChannels[0].name}` : "#"}
                messages={chatMessages}
              />
            ) : null}
            {activeVoiceChannelId ? (
              <VoicePanel
                users={activeVoiceMembers}
                roomName={activeVoiceChannelName || undefined}
                onLeave={handleLeaveVoiceChannel}
                speakingByUserId={voiceSpeakingByUserId}
                selfUserId={meSummary?.id ?? null}
                screenShareEnabled={screenShareEnabled}
                onToggleScreenShare={voiceSession.toggleScreenShare}
                localScreenStream={localScreenStream}
                screenShares={screenShares}
                screenStreamsByFeedId={screenStreamsByFeedId}
                selectedScreenFeedId={selectedScreenFeedId}
                onWatchScreen={voiceSession.watchScreen}
                onLeaveScreen={voiceSession.leaveScreen}
                expanded={voicePanelExpanded}
                onToggleExpanded={handleToggleExpanded}
                focusedUserId={focusedUserId}
                onFocusUser={voiceSession.focusUser}
                volumeByUserId={volumeByUserId}
                onVolumeChange={voiceSession.setVolume}
                micMuted={micMuted}
                onToggleMute={() => voiceSession.setMicMuted(!micMuted)}
                incomingMuted={incomingMuted}
                onToggleIncomingMute={() =>
                  voiceSession.setIncomingMuted(!incomingMuted)
                }
                mutedUserIds={mutedUserIds}
                onToggleUserMute={voiceSession.toggleUserMute}
                controlsEnabled={voiceReady}
              />
            ) : null}
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
