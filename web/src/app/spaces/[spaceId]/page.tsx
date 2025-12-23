"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [localMediaStream, setLocalMediaStream] = useState<MediaStream | null>(
    null,
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoStreamsByUserId, setVideoStreamsByUserId] = useState<
    Record<string, MediaStream>
  >({});

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
      setVideoEnabled(false);
      setLocalMediaStream(null);
      setCameraError(null);
      setVideoStreamsByUserId({});
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
      setActiveVoiceChannelId(null);
      setVideoEnabled(false);
      setLocalMediaStream(null);
      setCameraError(null);
      setVideoStreamsByUserId({});
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
    setVoiceSpeakingByUserId((prev) => {
      if (prev[userId] === speaking) return prev;
      return { ...prev, [userId]: speaking };
    });
  }, []);

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

  const handleToggleVideo = useCallback(() => {
    setVideoEnabled((v) => !v);
  }, []);

  const handleLocalStream = useCallback(
    (stream: MediaStream | null) => {
      setLocalMediaStream(stream);
      const myId = meSummary?.id;
      setVideoStreamsByUserId((prev) => {
        const next = { ...prev };
        if (!stream) {
          if (myId) delete next[myId];
          return next;
        }
        if (myId) next[myId] = stream;
        return next;
      });
    },
    [meSummary?.id],
  );

  useEffect(() => {
    const myId = meSummary?.id;
    if (!myId || !localMediaStream) return;
    setVideoStreamsByUserId((prev) => {
      if (prev[myId] === localMediaStream) return prev;
      return { ...prev, [myId]: localMediaStream };
    });
  }, [localMediaStream, meSummary?.id]);

  const handleRemoteStream = useCallback((userId: string, stream: MediaStream) => {
    setVideoStreamsByUserId((prev) => ({ ...prev, [userId]: stream }));
  }, []);

  const handleRemoteStreamRemoved = useCallback((userId: string) => {
    setVideoStreamsByUserId((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
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
      <div className="flex h-screen overflow-hidden">
        <SpaceRail spaces={railSpaces} />
        {state.status === "ready" ? (
          <>
            <SpaceSidebar
              spaceId={state.space.id}
              spaceName={state.space.name}
              textChannels={textChannels}
              voiceChannels={voiceChannels}
              voiceMembersByChannelId={voiceMembersByChannelId}
              activeVoiceChannelId={activeVoiceChannelId}
              onSelectVoiceChannel={handleSelectVoiceChannel}
              onLeaveVoiceChannel={handleLeaveVoiceChannel}
              onChannelsChanged={() => setReloadKey((v) => v + 1)}
            />
            <ChatPanel
              channelTitle={textChannels[0] ? `# ${textChannels[0].name}` : "#"}
              messages={chatMessages}
            />
            <VoicePanel
              users={activeVoiceMembers}
              roomName={activeVoiceChannelName || undefined}
              onLeave={handleLeaveVoiceChannel}
              speakingByUserId={voiceSpeakingByUserId}
              selfUserId={meSummary?.id ?? null}
              videoEnabled={videoEnabled}
              onToggleVideo={handleToggleVideo}
              localMediaStream={localMediaStream}
              cameraError={cameraError}
              videoStreamsByUserId={videoStreamsByUserId}
            />
            <VoiceWebRTC
              channelId={activeVoiceChannelId}
              onSpeaking={handleSpeaking}
              selfUserId={meSummary?.id ?? null}
              videoEnabled={videoEnabled}
              onLocalStream={handleLocalStream}
              onRemoteStream={handleRemoteStream}
              onRemoteStreamRemoved={handleRemoteStreamRemoved}
              onCameraError={setCameraError}
              onFatalError={() => {
                // If we fail to bootstrap/reconnect, clean stale "in channel" presence.
                leaveVoiceChannel()
                  .catch(() => {})
                  .finally(() => {
                    setActiveVoiceChannelId(null);
                    setVideoEnabled(false);
                    setLocalMediaStream(null);
                    setCameraError(null);
                    setVideoStreamsByUserId({});
                  });
              }}
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
    </div>
  );
}
