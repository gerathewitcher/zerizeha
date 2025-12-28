"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ChatPanel from "@/components/spaces/ChatPanel";
import SpaceRail from "@/components/spaces/SpaceRail";
import SpaceSidebar from "@/components/spaces/SpaceSidebar";
import VoicePanel from "@/components/spaces/VoicePanel";
import VoiceWebRTC from "@/components/spaces/VoiceWebRTC";
import ErrorState from "@/components/ui/ErrorState";
import { fetchChannelsBySpaceId } from "@/lib/api/channels";
import { getHttpStatus } from "@/lib/api/errors";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";
import { fetchSpaceById, fetchSpaces } from "@/lib/api/spaces";
import { buildWebSocketUrl } from "@/lib/api/ws";
import {
  fetchVoiceMembers,
  joinVoiceChannelById,
  leaveVoiceChannel,
} from "@/lib/api/voice";
import { useMe } from "@/lib/me";
import { messages } from "@/lib/mock";
import type { Channel, Space } from "@/lib/api/generated/zerizeha-schemas";
import type { VoiceMember } from "@/lib/api/generated/zerizeha-schemas";

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
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(
    null,
  );
  const [voiceMembersByChannelId, setVoiceMembersByChannelId] = useState<
    Record<string, VoiceMember[]>
  >({});
  const [voiceSpeakingByUserId, setVoiceSpeakingByUserId] = useState<
    Record<string, boolean>
  >({});
  const [voiceFatalError, setVoiceFatalError] = useState<string | null>(null);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(
    null,
  );
  const [screenStreamsByFeedId, setScreenStreamsByFeedId] = useState<
    Record<string, MediaStream>
  >({});
  const [screenShares, setScreenShares] = useState<
    { feedId: string; userId: string }[]
  >([]);
  const [selectedScreenFeedId, setSelectedScreenFeedId] = useState<string | null>(
    null,
  );
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<
    "good" | "ok" | "bad" | "unknown"
  >("unknown");
  const [voicePanelExpanded, setVoicePanelExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const lastManualFocusAtRef = useRef(0);
  const lastActiveSpeakerIdRef = useRef<string | null>(null);
  const [volumeByUserId, setVolumeByUserId] = useState<Record<string, number>>(
    {},
  );
  const volumeStorageKey = "zerizeha.voice.volumeByUserId";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(volumeStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        setVolumeByUserId(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(volumeStorageKey, JSON.stringify(volumeByUserId));
    } catch {
      // ignore
    }
  }, [volumeByUserId]);

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

  const activeVoiceChannelName = useMemo(() => {
    if (!activeVoiceChannelId) return "";
    const found = voiceChannels.find((ch) => ch.id === activeVoiceChannelId);
    return found?.name ?? "";
  }, [activeVoiceChannelId, voiceChannels]);

  const activeVoiceMembers = useMemo(() => {
    if (!activeVoiceChannelId) return [];
    return voiceMembersByChannelId[activeVoiceChannelId] ?? [];
  }, [activeVoiceChannelId, voiceMembersByChannelId]);

  const meSummary = useMemo(() => {
    if (meState.state.status !== "ready") return null;
    if (!meState.state.me.id) return null;
    return {
      id: meState.state.me.id,
      username: meState.state.me.username || "user",
      is_admin: !!meState.state.me.is_admin,
      avatar_url: null as string | null,
    };
  }, [meState.state]);

  const handleSelectVoiceChannel = useCallback(
    async (channelId: string) => {
      if (!channelId) return;
      if (channelId === activeVoiceChannelId) return;
      setVoiceFatalError(null);
      setScreenShareEnabled(false);
      setLocalScreenStream(null);
      setScreenStreamsByFeedId({});
      setScreenShares([]);
      setSelectedScreenFeedId(null);
      setFocusedUserId(null);
      setConnectionQuality("unknown");
      setVoicePanelExpanded(true);
      setChatOpen(false);
      try {
        await joinVoiceChannelById(channelId);
        setActiveVoiceChannelId(channelId);
        if (meSummary?.id) {
          setVoiceMembersByChannelId((prev) => {
            const next: Record<string, VoiceMember[]> = {};
            for (const [cid, members] of Object.entries(prev)) {
              next[cid] = members.filter((m) => m.id !== meSummary.id);
            }
            const current = next[channelId] ?? prev[channelId] ?? [];
            next[channelId] = [
              ...current.filter((m) => m.id !== meSummary.id),
              meSummary,
            ];
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to join voice channel", err);
        redirectIfAuthOrOnboardingError(err);
      }
    },
    [activeVoiceChannelId, meSummary],
  );

  const handleLeaveVoiceChannel = useCallback(async () => {
    let success = false;
    try {
      await leaveVoiceChannel();
      success = true;
    } catch (err) {
      console.error("Failed to leave voice channel", err);
      redirectIfAuthOrOnboardingError(err);
    }

    if (success) {
      setVoiceFatalError(null);
      setActiveVoiceChannelId(null);
      setScreenShareEnabled(false);
      setLocalScreenStream(null);
      setScreenStreamsByFeedId({});
      setScreenShares([]);
      setSelectedScreenFeedId(null);
      setFocusedUserId(null);
      setConnectionQuality("unknown");
      setVoicePanelExpanded(false);
      setChatOpen(true);
      if (meSummary?.id) {
        setVoiceMembersByChannelId((prev) => {
          const next: Record<string, VoiceMember[]> = {};
          for (const [cid, members] of Object.entries(prev)) {
            next[cid] = members.filter((m) => m.id !== meSummary.id);
          }
          return next;
        });
      }
    }
  }, [meSummary]);

  const handleSpeaking = useCallback((userId: string, speaking: boolean) => {
    if (speaking) lastActiveSpeakerIdRef.current = userId;
    setVoiceSpeakingByUserId((prev) => {
      if (prev[userId] === speaking) return prev;
      return { ...prev, [userId]: speaking };
    });
  }, []);

  const handleConnectionQuality = useCallback(
    (quality: "good" | "ok" | "bad" | "unknown") => {
      setConnectionQuality(quality);
    },
    [],
  );

  const autoReconnectDone = useRef(false);
  useEffect(() => {
    if (autoReconnectDone.current) return;
    if (activeVoiceChannelId) {
      autoReconnectDone.current = true;
      return;
    }
    const myId = meSummary?.id;
    if (!myId) return;
    const entries = Object.entries(voiceMembersByChannelId);
    if (!entries.length) return;

    const found = entries.find(([, members]) => members.some((m) => m.id === myId));
    if (!found) {
      autoReconnectDone.current = true;
      return;
    }

    const channelId = found[0];
    // Re-issue join to refresh presence TTL and ensure Redis state is consistent.
    joinVoiceChannelById(channelId)
      .then(() => {
        setActiveVoiceChannelId(channelId);
        autoReconnectDone.current = true;
      })
      .catch((err) => {
        console.error("Auto-reconnect join failed", err);
        autoReconnectDone.current = true;
      });
  }, [activeVoiceChannelId, meSummary?.id, voiceMembersByChannelId]);

  const handleToggleScreenShare = useCallback(() => {
    setScreenShareEnabled((v) => !v);
  }, []);

  const handleLocalScreenStream = useCallback((stream: MediaStream | null) => {
    setLocalScreenStream(stream);
  }, []);

  const handleRemoteScreenStream = useCallback(
    (feedId: string, _userId: string, stream: MediaStream) => {
      setScreenStreamsByFeedId((prev) => ({ ...prev, [feedId]: stream }));
    },
    [],
  );

  const handleRemoteScreenStreamRemoved = useCallback((feedId: string) => {
    setScreenStreamsByFeedId((prev) => {
      if (!prev[feedId]) return prev;
      const next = { ...prev };
      delete next[feedId];
      return next;
    });
    setSelectedScreenFeedId((prev) => (prev === feedId ? null : prev));
  }, []);

  const handleScreenSharesChange = useCallback(
    (shares: { feedId: string; userId: string }[]) => {
      setScreenShares(shares);
      setSelectedScreenFeedId((prev) => {
        if (!prev) return prev;
        if (prev === "local") return prev;
        return shares.some((s) => s.feedId === prev) ? prev : null;
      });
    },
    [],
  );

  const handleScreenShareStateChange = useCallback((active: boolean) => {
    setScreenShareEnabled(active);
    if (!active) setLocalScreenStream(null);
  }, []);

  const handleWatchScreen = useCallback((feedId: string) => {
    setSelectedScreenFeedId(feedId);
    setFocusedUserId(null);
  }, []);

  const handleLeaveScreen = useCallback(() => {
    setSelectedScreenFeedId(null);
  }, []);

  const handleFocusUser = useCallback((userId: string | null) => {
    lastManualFocusAtRef.current = Date.now();
    setFocusedUserId(userId);
    setSelectedScreenFeedId(null);
  }, []);

  const handleToggleExpanded = useCallback(() => {
    setVoicePanelExpanded((prev) => {
      const next = !prev;
      if (next) setChatOpen(false);
      if (!next) setChatOpen(true);
      return next;
    });
  }, []);

  const handleVolumeChange = useCallback((userId: string, volume: number) => {
    setVolumeByUserId((prev) => ({
      ...prev,
      [userId]: Math.max(0, Math.min(1, volume)),
    }));
  }, []);

  useEffect(() => {
    if (!voicePanelExpanded) return;
    if (selectedScreenFeedId) return;
    const lastSpeaker = lastActiveSpeakerIdRef.current;
    if (!lastSpeaker) return;
    if (!voiceSpeakingByUserId[lastSpeaker]) return;
    const sinceManual = Date.now() - lastManualFocusAtRef.current;
    if (sinceManual < 6000) return;
    if (focusedUserId === lastSpeaker) return;
    setFocusedUserId(lastSpeaker);
  }, [voicePanelExpanded, selectedScreenFeedId, voiceSpeakingByUserId, focusedUserId]);

  const handleToggleChat = useCallback(() => {
    setChatOpen(true);
    setVoicePanelExpanded(false);
  }, []);

  useEffect(() => {
    if (!activeVoiceChannelId) setVoiceSpeakingByUserId({});
  }, [activeVoiceChannelId]);

  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let retryMs = 500;

    const connect = () => {
      if (cancelled) return;
      const url = buildWebSocketUrl(`/api/ws/voice/${state.space.id}`);
      ws = new WebSocket(url);

      ws.onopen = async () => {
        retryMs = 500;
        // On connect (or reconnect), refresh once via HTTP as a fallback.
        try {
          const voiceIds = voiceChannels.map((c) => c.id);
          if (!voiceIds.length) return;
          const controller = new AbortController();
          const results = await Promise.all(
            voiceIds.map((id) => fetchVoiceMembers(id, controller.signal)),
          );
          const next: Record<string, VoiceMember[]> = {};
          voiceIds.forEach((id, idx) => {
            next[id] = results[idx];
          });
          setVoiceMembersByChannelId(next);
        } catch (err) {
          // ignore
        }
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg?.type === "snapshot") {
          const map = msg?.payload?.voice_members_by_channel_id;
          if (map && typeof map === "object") setVoiceMembersByChannelId(map);
          return;
        }
        if (msg?.type === "channel_members") {
          const channelId = msg?.payload?.channel_id;
          const members = msg?.payload?.members;
          if (!channelId || !Array.isArray(members)) return;
          setVoiceMembersByChannelId((prev) => ({ ...prev, [channelId]: members }));
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        retryTimer = window.setTimeout(() => {
          retryMs = Math.min(8000, Math.round(retryMs * 1.6));
          connect();
        }, retryMs);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        // ignore
      }
    };
  }, [state.status, state.status === "ready" ? state.space.id : "", voiceChannels]);

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      {voiceFatalError ? (
        <div className="mx-auto mt-4 w-full max-w-6xl px-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <span>{voiceFatalError}</span>
            <button
              type="button"
              className="rounded-full border border-amber-500/30 px-3 py-1 text-xs text-amber-200 transition hover:border-amber-400"
              onClick={() => setVoiceFatalError(null)}
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
              connectionQuality={connectionQuality}
              onSelectVoiceChannel={handleSelectVoiceChannel}
              onLeaveVoiceChannel={handleLeaveVoiceChannel}
              onToggleChat={handleToggleChat}
              chatOpen={chatOpen}
              volumeByUserId={volumeByUserId}
              onVolumeChange={handleVolumeChange}
              onChannelsChanged={() => setReloadKey((v) => v + 1)}
            />
            {chatOpen && !voicePanelExpanded ? (
              <ChatPanel
                channelTitle={textChannels[0] ? `# ${textChannels[0].name}` : "#"}
                messages={chatMessages}
              />
            ) : null}
            <VoicePanel
              users={activeVoiceMembers}
              roomName={activeVoiceChannelName || undefined}
              onLeave={handleLeaveVoiceChannel}
              speakingByUserId={voiceSpeakingByUserId}
              selfUserId={meSummary?.id ?? null}
              screenShareEnabled={screenShareEnabled}
              onToggleScreenShare={handleToggleScreenShare}
              localScreenStream={localScreenStream}
              screenShares={screenShares}
              screenStreamsByFeedId={screenStreamsByFeedId}
              selectedScreenFeedId={selectedScreenFeedId}
              onWatchScreen={handleWatchScreen}
              onLeaveScreen={handleLeaveScreen}
              expanded={voicePanelExpanded}
              onToggleExpanded={handleToggleExpanded}
              focusedUserId={focusedUserId}
              onFocusUser={handleFocusUser}
              volumeByUserId={volumeByUserId}
              onVolumeChange={handleVolumeChange}
            />
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
      {state.status === "ready" ? (
        <VoiceWebRTC
          channelId={activeVoiceChannelId}
          onSpeaking={handleSpeaking}
          selfUserId={meSummary?.id ?? null}
          onLocalScreenStream={handleLocalScreenStream}
          onRemoteScreenStream={handleRemoteScreenStream}
          onRemoteScreenStreamRemoved={handleRemoteScreenStreamRemoved}
          onScreenSharesChange={handleScreenSharesChange}
          onConnectionQuality={handleConnectionQuality}
          screenShareEnabled={screenShareEnabled}
          onScreenShareStateChange={handleScreenShareStateChange}
          watchFeedId={selectedScreenFeedId === "local" ? null : selectedScreenFeedId}
          volumeByUserId={volumeByUserId}
          onFatalError={(message) => {
            // If we fail to bootstrap/reconnect, clean stale "in channel" presence.
            console.error("Voice fatal error", message);
            setVoiceFatalError(message);
            leaveVoiceChannel()
              .catch(() => {})
              .finally(() => {
                setActiveVoiceChannelId(null);
                setScreenShareEnabled(false);
                setLocalScreenStream(null);
                setScreenStreamsByFeedId({});
                setScreenShares([]);
                setSelectedScreenFeedId(null);
                setFocusedUserId(null);
                setConnectionQuality("unknown");
                setVoicePanelExpanded(false);
                setChatOpen(true);
              });
          }}
        />
      ) : null}
    </div>
  );
}
