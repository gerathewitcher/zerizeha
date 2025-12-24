"use client";

import { useEffect, useRef, useState } from "react";
import { bootstrapVoiceWebRTC } from "@/lib/api/voice";
import { buildWebSocketUrl } from "@/lib/api/ws";

type WebRTCJSEP = { type: RTCSdpType; sdp: string };

type WSEnvelope =
  | { type: "ready"; payload: { publishers: Array<{ feed_id: string; display?: string | null }> } }
  | { type: "publisher_joined"; payload: { feed_id: string; display?: string | null } }
  | { type: "publisher_left"; payload: { feed_id: string } }
  | { type: "publish_answer"; request_id: string; payload: { jsep: WebRTCJSEP } }
  | {
      type: "screen_publish_answer";
      request_id: string;
      payload: { feed_id: string; jsep: WebRTCJSEP };
    }
  | { type: "subscribe_offer"; request_id: string; payload: { feed_id: string; jsep: WebRTCJSEP } }
  | { type: "subscribe_answer_ack"; request_id: string }
  | { type: "screen_leave_ack"; request_id: string }
  | {
      type: "trickle";
      payload: {
        target: "publisher" | "subscriber" | "screen_publisher";
        feed_id?: string;
        candidate: any;
      };
    }
  | { type: "trickle_ack"; request_id: string }
  | { type: "error"; request_id?: string; payload?: { message?: string } }
  | { type: string; request_id?: string; payload?: any };

type RemoteTrack = { feedId: string; stream: MediaStream; userId?: string };

type FeedKind = "voice" | "screen";

type ScreenShareInfo = { feedId: string; userId: string };

const parseUrls = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const buildIceServers = (): RTCIceServer[] => {
  const stunUrls = parseUrls(
    process.env.NEXT_PUBLIC_STUN_URLS ?? "stun:stun.l.google.com:19302",
  );
  const turnUrls = parseUrls(process.env.NEXT_PUBLIC_TURN_URLS);
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const servers: RTCIceServer[] = [];
  if (stunUrls.length) servers.push({ urls: stunUrls });
  if (turnUrls.length && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
};

type ConnectionQuality = "good" | "ok" | "bad" | "unknown";

const extractConnectionQuality = (stats: RTCStatsReport): ConnectionQuality => {
  let lossRatio: number | null = null;
  let jitterMs: number | null = null;

  for (const entry of stats.values()) {
    if (entry.type !== "remote-inbound-rtp") continue;
    if (entry.kind && entry.kind !== "audio") continue;

    const lost = typeof entry.packetsLost === "number" ? entry.packetsLost : null;
    const received =
      typeof entry.packetsReceived === "number" ? entry.packetsReceived : null;
    if (lost != null && received != null && received + lost > 0) {
      lossRatio = lost / (received + lost);
    }
    if (typeof entry.jitter === "number" && isFinite(entry.jitter)) {
      jitterMs = entry.jitter * 1000;
    }
    break;
  }

  if (lossRatio == null && jitterMs == null) return "unknown";

  const loss = lossRatio ?? 0;
  const jitter = jitterMs ?? 0;
  if (loss < 0.02 && jitter < 20) return "good";
  if (loss < 0.05 && jitter < 50) return "ok";
  return "bad";
};

const parseDisplay = (
  display?: string | null,
): { userId: string; kind: FeedKind } | null => {
  if (!display) return null;
  if (display.endsWith("|screen")) {
    const userId = display.slice(0, -"|screen".length);
    if (!userId) return null;
    return { userId, kind: "screen" };
  }
  return { userId: display, kind: "voice" };
};

function RemoteAudio({
  stream,
  volume,
}: {
  stream: MediaStream;
  volume: number;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // Autoplay is often blocked unless muted; start muted, then unmute after playback begins.
    el.muted = true;
    const p = el.play();
    if (p) {
      p.then(() => {
        el.muted = false;
      }).catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function isCompletedCandidate(candidate: any): boolean {
  return !!candidate && typeof candidate === "object" && candidate.completed === true;
}

async function addIceCandidateSafe(pc: RTCPeerConnection, candidate: any) {
  if (isCompletedCandidate(candidate)) {
    await pc.addIceCandidate(null).catch(() => {});
    return;
  }
  if (!candidate) return;
  await pc.addIceCandidate(candidate as RTCIceCandidateInit).catch(() => {});
}

class SignalingClient {
  private ws: WebSocket;
  private pending = new Map<
    string,
    {
      expectedType?: string;
      resolve: (msg: WSEnvelope) => void;
      reject: (err: Error) => void;
      timeout: number;
    }
  >();

  onEvent?: (msg: WSEnvelope) => void;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.onmessage = (ev) => {
      let msg: WSEnvelope;
      try {
        msg = JSON.parse(String(ev.data)) as WSEnvelope;
      } catch {
        return;
      }

      const requestId = (msg as any).request_id as string | undefined;
      if (requestId && this.pending.has(requestId)) {
        const entry = this.pending.get(requestId)!;
        if (msg.type === "error") {
          clearTimeout(entry.timeout);
          this.pending.delete(requestId);
          entry.reject(new Error((msg as any).payload?.message || "request failed"));
          return;
        }
        if (entry.expectedType && msg.type !== entry.expectedType) {
          // Ignore unrelated responses with same request_id (shouldn't happen, but safe).
          return;
        }
        clearTimeout(entry.timeout);
        this.pending.delete(requestId);
        entry.resolve(msg);
        return;
      }

      this.onEvent?.(msg);
    };
  }

  send(type: string, payload?: any, requestId?: string) {
    const msg: any = { type };
    if (requestId) msg.request_id = requestId;
    if (payload !== undefined) msg.payload = payload;
    this.ws.send(JSON.stringify(msg));
  }

  request<T extends WSEnvelope>(
    type: string,
    payload: any,
    expectedType: T["type"],
    timeoutMs = 20000,
  ): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("request timeout"));
      }, timeoutMs);

      this.pending.set(requestId, {
        expectedType: String(expectedType),
        resolve: (msg) => resolve(msg as T),
        reject,
        timeout,
      });

      this.send(type, payload, requestId);
    });
  }

  close() {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timeout);
      entry.reject(new Error("connection closed"));
      this.pending.delete(id);
    }
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

type VoiceWebRTCProps = {
  channelId: string | null;
  onSpeaking?: (userId: string, speaking: boolean) => void;
  selfUserId?: string | null;
  onLocalScreenStream?: (stream: MediaStream | null) => void;
  onRemoteScreenStream?: (feedId: string, userId: string, stream: MediaStream) => void;
  onRemoteScreenStreamRemoved?: (feedId: string) => void;
  onScreenSharesChange?: (shares: ScreenShareInfo[]) => void;
  onFatalError?: (message: string) => void;
  onConnectionQuality?: (quality: ConnectionQuality) => void;
  screenShareEnabled?: boolean;
  onScreenShareStateChange?: (active: boolean) => void;
  watchFeedId?: string | null;
  volumeByUserId?: Record<string, number>;
};

export default function VoiceWebRTC({
  channelId,
  onSpeaking,
  selfUserId,
  onLocalScreenStream,
  onRemoteScreenStream,
  onRemoteScreenStreamRemoved,
  onScreenSharesChange,
  onFatalError,
  onConnectionQuality,
  screenShareEnabled = false,
  onScreenShareStateChange,
  watchFeedId = null,
  volumeByUserId = {},
}: VoiceWebRTCProps) {
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);

  const onSpeakingRef = useRef<VoiceWebRTCProps["onSpeaking"]>(onSpeaking);
  useEffect(() => {
    onSpeakingRef.current = onSpeaking;
  }, [onSpeaking]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const publisherPcRef = useRef<RTCPeerConnection | null>(null);
  const ensureSubscriberRef = useRef<((feedId: string) => void) | undefined>(
    undefined,
  );
  const screenControlRef = useRef<{
    start: () => void;
    stop: () => void;
  } | null>(null);

  const selfUserIdRef = useRef<string | null | undefined>(selfUserId);
  useEffect(() => {
    selfUserIdRef.current = selfUserId;
  }, [selfUserId]);

  const screenShareEnabledRef = useRef<boolean>(screenShareEnabled);
  useEffect(() => {
    screenShareEnabledRef.current = screenShareEnabled;
    const controls = screenControlRef.current;
    if (!controls) return;
    if (screenShareEnabled) {
      controls.start();
    } else {
      controls.stop();
    }
  }, [screenShareEnabled]);

  useEffect(() => {
    if (!watchFeedId) return;
    ensureSubscriberRef.current?.(watchFeedId);
  }, [watchFeedId]);

  const onLocalScreenStreamRef = useRef<VoiceWebRTCProps["onLocalScreenStream"]>(
    onLocalScreenStream,
  );
  useEffect(() => {
    onLocalScreenStreamRef.current = onLocalScreenStream;
  }, [onLocalScreenStream]);

  const onRemoteScreenStreamRef = useRef<VoiceWebRTCProps["onRemoteScreenStream"]>(
    onRemoteScreenStream,
  );
  useEffect(() => {
    onRemoteScreenStreamRef.current = onRemoteScreenStream;
  }, [onRemoteScreenStream]);

  const onRemoteScreenStreamRemovedRef = useRef<
    VoiceWebRTCProps["onRemoteScreenStreamRemoved"]
  >(onRemoteScreenStreamRemoved);
  useEffect(() => {
    onRemoteScreenStreamRemovedRef.current = onRemoteScreenStreamRemoved;
  }, [onRemoteScreenStreamRemoved]);

  const onScreenSharesChangeRef = useRef<VoiceWebRTCProps["onScreenSharesChange"]>(
    onScreenSharesChange,
  );
  useEffect(() => {
    onScreenSharesChangeRef.current = onScreenSharesChange;
  }, [onScreenSharesChange]);

  const onFatalErrorRef = useRef<VoiceWebRTCProps["onFatalError"]>(onFatalError);
  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

  const onConnectionQualityRef = useRef<VoiceWebRTCProps["onConnectionQuality"]>(
    onConnectionQuality,
  );
  useEffect(() => {
    onConnectionQualityRef.current = onConnectionQuality;
  }, [onConnectionQuality]);

  const onScreenShareStateChangeRef = useRef<
    VoiceWebRTCProps["onScreenShareStateChange"]
  >(onScreenShareStateChange);
  useEffect(() => {
    onScreenShareStateChangeRef.current = onScreenShareStateChange;
  }, [onScreenShareStateChange]);

  useEffect(() => {
    if (!channelId) {
      setRemoteTracks([]);
      return;
    }

    let cancelled = false;
    const rtcConfig = { iceServers: buildIceServers() };

    const publisherPc = new RTCPeerConnection(rtcConfig);
    publisherPcRef.current = publisherPc;
    const subscriberPcs = new Map<string, RTCPeerConnection>();
    const subscriberIceBuffer = new Map<string, any[]>();
    const publisherIceBuffer: any[] = [];
    const feedMetaById = new Map<string, { userId: string; kind: FeedKind }>();
    const screenFeeds = new Map<string, string>();
    const remoteStreamByFeedId = new Map<string, MediaStream>();
    const meters = new Map<
      string,
      {
        stop: () => void;
        speaking: boolean;
        lastOnMs: number;
      }
    >();
    let audioCtx: AudioContext | null = null;

    let localStream: MediaStream | null = null;
    let client: SignalingClient | null = null;
    let ws: WebSocket | null = null;
    let selfFeedId = "";
    let statsTimer: number | null = null;
    let screenPc: RTCPeerConnection | null = null;
    let screenStream: MediaStream | null = null;
    let screenIceBuffer: any[] = [];
    let screenFeedId = "";
    let screenActive = false;

    const cleanup = () => {
      cancelled = true;
      try {
        client?.send("leave");
      } catch {
        // ignore
      }
      client?.close();
      client = null;

      try {
        ws?.close();
      } catch {
        // ignore
      }
      ws = null;

      const notify = onSpeakingRef.current;
      if (notify) {
        for (const meta of feedMetaById.values()) notify(meta.userId, false);
        const selfId = selfUserIdRef.current;
        if (selfId) notify(selfId, false);
      }

      for (const m of meters.values()) m.stop();
      meters.clear();
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch {
          // ignore
        }
      }
      audioCtx = null;

      if (statsTimer) {
        window.clearInterval(statsTimer);
        statsTimer = null;
      }

      for (const pc of subscriberPcs.values()) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
      subscriberPcs.clear();

      try {
        publisherPc.close();
      } catch {
        // ignore
      }
      publisherPcRef.current = null;

      if (screenPc) {
        try {
          screenPc.close();
        } catch {
          // ignore
        }
      }
      screenPc = null;
      screenFeedId = "";
      screenActive = false;
      if (screenStream) {
        for (const t of screenStream.getTracks()) t.stop();
      }
      screenStream = null;
      screenIceBuffer = [];
      onLocalScreenStreamRef.current?.(null);
      onScreenShareStateChangeRef.current?.(false);
      onScreenSharesChangeRef.current?.([]);

      if (localStream) {
        for (const t of localStream.getTracks()) t.stop();
      }
      localStream = null;
      localStreamRef.current = null;
      onConnectionQualityRef.current?.("unknown");
      setRemoteTracks([]);
      ensureSubscriberRef.current = undefined;
      screenControlRef.current = null;
    };

    const startStatsPolling = () => {
      if (!onConnectionQualityRef.current) return;
      if (statsTimer) return;
      statsTimer = window.setInterval(async () => {
        if (cancelled) return;
        try {
          const report = await publisherPc.getStats();
          const quality = extractConnectionQuality(report);
          onConnectionQualityRef.current?.(quality);
        } catch {
          // ignore
        }
      }, 2000);
    };

    const notifyScreenShares = () => {
      if (!onScreenSharesChangeRef.current) return;
      const shares: ScreenShareInfo[] = [];
      for (const [feedId, userId] of screenFeeds.entries()) {
        shares.push({ feedId, userId });
      }
      onScreenSharesChangeRef.current(shares);
    };

    const ensureAudioContext = async () => {
      if (audioCtx) return audioCtx;
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          // ignore
        }
      }
      return audioCtx;
    };

    const startRmsMeter = async (
      key: string,
      stream: MediaStream,
      resolveUserId: () => string | null,
    ) => {
      if (meters.has(key)) return;
      const ctx = await ensureAudioContext();
      if (cancelled) return;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.fftSize);
      let timer: number | null = null;
      let speaking = false;
      let lastOnMs = 0;

      const tick = () => {
        if (cancelled) return;
        const notify = onSpeakingRef.current;
        const userId = resolveUserId();
        if (!notify || !userId) {
          timer = window.setTimeout(tick, 140);
          return;
        }

        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(1, Math.max(0, (rms - 0.01) / 0.12));

        const now = Date.now();
        const onTh = 0.08;
        const offTh = 0.04;
        const holdMs = 450;

        let next = speaking;
        if (!speaking && level >= onTh) {
          next = true;
          lastOnMs = now;
        } else if (speaking && level <= offTh) {
          if (now - lastOnMs >= holdMs) next = false;
        } else if (speaking) {
          lastOnMs = now;
        }

        if (next !== speaking) {
          speaking = next;
          notify(userId, speaking);
        }

        timer = window.setTimeout(tick, 140);
      };

      timer = window.setTimeout(tick, 140);

      const stop = () => {
        if (timer) window.clearTimeout(timer);
        try {
          source.disconnect();
        } catch {}
        try {
          analyser.disconnect();
        } catch {}
      };

      meters.set(key, { stop, speaking, lastOnMs });
    };

    const ensureSubscriber = async (feedId: string) => {
      if (!feedId || feedId === selfFeedId) return;
      if (subscriberPcs.has(feedId)) return;

      // A publisher may be visible before it has actually started publishing;
      // retry a few times (Janus would reply "No such feed").
      let offerMsg: Extract<WSEnvelope, { type: "subscribe_offer" }> | null = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (cancelled) return;
        try {
          offerMsg = await client!.request<Extract<WSEnvelope, { type: "subscribe_offer" }>>(
            "subscribe",
            { feed_id: feedId },
            "subscribe_offer",
          );
          break;
        } catch (err) {
          if (attempt === 5) throw err;
          await new Promise((r) => setTimeout(r, 300 + attempt * 250));
        }
      }
      if (cancelled) return;

      const pc = new RTCPeerConnection(rtcConfig);
      subscriberPcs.set(feedId, pc);

      pc.ontrack = (ev) => {
        // Janus may deliver audio/video as separate ontrack events and sometimes without `ev.streams`.
        // Keep a single MediaStream per feed and merge tracks into it.
        let stream = remoteStreamByFeedId.get(feedId) ?? null;
        const incoming = ev.streams?.[0] ?? null;

        if (!stream) {
          stream = incoming ?? new MediaStream();
          remoteStreamByFeedId.set(feedId, stream);
        }

        if (incoming && incoming !== stream) {
          // Merge tracks from incoming stream.
          for (const t of incoming.getTracks()) {
            const exists = stream.getTracks().some((x) => x.id === t.id);
            if (!exists) stream.addTrack(t);
          }
        } else {
          const exists = stream.getTracks().some((x) => x.id === ev.track.id);
          if (!exists) stream.addTrack(ev.track);
        }

        const meta = feedMetaById.get(feedId);
        const userId = meta?.userId;
        const kind = meta?.kind ?? "voice";

        if (kind === "voice") {
          // RMS-based speaking detection for this remote stream, without routing audio to output.
          startRmsMeter(feedId, stream, () => userId ?? null).catch(() => {});
        }
        if (userId && kind === "screen") {
          onRemoteScreenStreamRef.current?.(feedId, userId, stream);
        }

        setRemoteTracks((prev) => {
          const next = prev.filter((t) => t.feedId !== feedId);
          next.push({ feedId, stream: stream!, userId });
          return next;
        });
      };

      pc.onicecandidate = (ev) => {
        if (!client) return;
        const payload = {
          target: "subscriber",
          feed_id: feedId,
          candidate: ev.candidate ? ev.candidate.toJSON() : { completed: true },
        };
        client.send("trickle", payload);
      };

      await pc.setRemoteDescription(offerMsg!.payload.jsep);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await client!.request<Extract<WSEnvelope, { type: "subscribe_answer_ack" }>>(
        "subscribe_answer",
        {
          feed_id: feedId,
          jsep: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp },
        },
        "subscribe_answer_ack",
      );

      const buffered = subscriberIceBuffer.get(feedId) || [];
      subscriberIceBuffer.delete(feedId);
      for (const cand of buffered) await addIceCandidateSafe(pc, cand);
    };
    ensureSubscriberRef.current = (feedId: string) => {
      ensureSubscriber(feedId).catch(() => {});
    };

    const startScreenShare = async () => {
      if (!client || screenActive) return;
      if (screenPc) return;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      } catch {
        onScreenShareStateChangeRef.current?.(false);
        return;
      }
      if (cancelled || !screenStream) return;

      onLocalScreenStreamRef.current?.(screenStream);
      onScreenShareStateChangeRef.current?.(true);

      try {
        screenPc = new RTCPeerConnection(rtcConfig);
        const tracks = screenStream.getTracks();
        for (const track of tracks) screenPc.addTrack(track, screenStream);

        const stopTrackShare = () => {
          stopScreenShare();
        };
        for (const track of tracks) {
          track.onended = stopTrackShare;
        }

        screenPc.onicecandidate = (ev) => {
          if (!client) return;
          client.send("trickle", {
            target: "screen_publisher",
            candidate: ev.candidate ? ev.candidate.toJSON() : { completed: true },
          });
        };

        const offer = await screenPc.createOffer();
        await screenPc.setLocalDescription(offer);
        const answerMsg = await client.request<
          Extract<WSEnvelope, { type: "screen_publish_answer" }>
        >(
          "screen_publish_offer",
          {
            jsep: {
              type: screenPc.localDescription!.type,
              sdp: screenPc.localDescription!.sdp,
            },
          },
          "screen_publish_answer",
        );
        if (cancelled || !screenPc) return;
        screenFeedId = answerMsg.payload.feed_id;
        await screenPc.setRemoteDescription(answerMsg.payload.jsep);
        for (const cand of screenIceBuffer.splice(0, screenIceBuffer.length)) {
          await addIceCandidateSafe(screenPc, cand);
        }
        screenActive = true;
      } catch {
        stopScreenShare();
      }
    };

    const stopScreenShare = () => {
      if (screenPc) {
        try {
          screenPc.close();
        } catch {
          // ignore
        }
      }
      screenPc = null;
      screenIceBuffer = [];
      if (screenStream) {
        for (const t of screenStream.getTracks()) t.stop();
      }
      screenStream = null;
      screenActive = false;
      if (client && screenFeedId) {
        try {
          client.send("screen_leave", {});
        } catch {
          // ignore
        }
      }
      screenFeedId = "";
      onLocalScreenStreamRef.current?.(null);
      onScreenShareStateChangeRef.current?.(false);
    };

    screenControlRef.current = {
      start: () => {
        startScreenShare().catch(() => {});
      },
      stop: () => {
        stopScreenShare();
      },
    };
    if (screenShareEnabledRef.current) {
      screenControlRef.current.start();
    }

    (async () => {
      try {
        startStatsPolling();
        const bootstrap = await bootstrapVoiceWebRTC(channelId);
        if (cancelled) return;

        selfFeedId = bootstrap.self_feed_id;
        const wsUrl = buildWebSocketUrl(`/api/ws/webrtc/${bootstrap.connection_id}`);

        ws = new WebSocket(wsUrl);
        client = new SignalingClient(ws);

        let resolveReady:
          | ((msg: Extract<WSEnvelope, { type: "ready" }>) => void)
          | null = null;
        const readyPromise = new Promise<Extract<WSEnvelope, { type: "ready" }>>((resolve) => {
          resolveReady = resolve;
        });

        client.onEvent = (msg) => {
          if (msg.type === "ready" && resolveReady) {
            resolveReady(msg as any);
            resolveReady = null;
          }

          if (msg.type === "trickle") {
            const payload = (msg as any).payload as {
              target: "publisher" | "subscriber" | "screen_publisher";
              feed_id?: string;
              candidate: any;
            };
            if (payload.target === "publisher") {
              if (!publisherPc.remoteDescription) {
                publisherIceBuffer.push(payload.candidate);
                return;
              }
              addIceCandidateSafe(publisherPc, payload.candidate);
              return;
            }
            if (payload.target === "screen_publisher") {
              if (!screenPc || !screenPc.remoteDescription) {
                screenIceBuffer.push(payload.candidate);
                return;
              }
              addIceCandidateSafe(screenPc, payload.candidate);
              return;
            }
            if (payload.target === "subscriber" && payload.feed_id) {
              const feedId = payload.feed_id;
              const pc = subscriberPcs.get(feedId);
              if (!pc || !pc.remoteDescription) {
                const buf = subscriberIceBuffer.get(feedId) || [];
                buf.push(payload.candidate);
                subscriberIceBuffer.set(feedId, buf);
                return;
              }
              addIceCandidateSafe(pc, payload.candidate);
            }
            return;
          }

          if (msg.type === "publisher_joined") {
            const feedId = (msg as any).payload?.feed_id as string | undefined;
            const display = (msg as any).payload?.display as string | undefined;
            if (feedId && display) {
              const meta = parseDisplay(display);
              if (meta) {
                feedMetaById.set(feedId, meta);
                if (meta.kind === "screen") {
                  screenFeeds.set(feedId, meta.userId);
                  notifyScreenShares();
                  const existing = remoteStreamByFeedId.get(feedId);
                  if (existing) {
                    onRemoteScreenStreamRef.current?.(feedId, meta.userId, existing);
                  }
                }
              }
            }
            if (feedId && feedMetaById.get(feedId)?.kind !== "screen") {
              ensureSubscriber(feedId).catch(() => {});
            }
            return;
          }

          if (msg.type === "publisher_left") {
            const feedId = (msg as any).payload?.feed_id as string | undefined;
            if (!feedId) return;
            const meta = feedMetaById.get(feedId);
            const userId = meta?.userId;
            const notify = onSpeakingRef.current;
            if (userId && notify) notify(userId, false);
            if (meta?.kind === "screen") {
              onRemoteScreenStreamRemovedRef.current?.(feedId);
              screenFeeds.delete(feedId);
              notifyScreenShares();
            }
            feedMetaById.delete(feedId);
            remoteStreamByFeedId.delete(feedId);
            const meter = meters.get(feedId);
            if (meter) meter.stop();
            meters.delete(feedId);
            const pc = subscriberPcs.get(feedId);
            if (pc) {
              try {
                pc.close();
              } catch {
                // ignore
              }
              subscriberPcs.delete(feedId);
            }
            setRemoteTracks((prev) => prev.filter((t) => t.feedId !== feedId));
          }

        };

        const openPromise = new Promise<void>((resolve, reject) => {
          if (!ws) return reject(new Error("ws not created"));
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("ws error"));
          ws.onclose = () => {
            if (cancelled) return;
            cleanup();
          };
        });

        await openPromise;
        if (!ws || cancelled) return;

        const ready = await readyPromise;
        if (cancelled) return;

        for (const p of ready.payload.publishers) {
          if (!p.feed_id || !p.display) continue;
          const meta = parseDisplay(p.display);
          if (!meta) continue;
          feedMetaById.set(p.feed_id, meta);
          if (meta.kind === "screen") {
            screenFeeds.set(p.feed_id, meta.userId);
          }
        }
        notifyScreenShares();

        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (cancelled) return;
        localStreamRef.current = localStream;

        // Local speaking indicator works even when you're alone.
        startRmsMeter(
          "__self__",
          localStream,
          () => selfUserIdRef.current ?? null,
        ).catch(() => {});

        // Add tracks.
        const audioTrack = localStream.getAudioTracks()[0] ?? null;

        if (audioTrack) {
          publisherPc.addTrack(audioTrack, localStream);
        }
        publisherPc.onicecandidate = (ev) => {
          if (!client) return;
          client.send("trickle", {
            target: "publisher",
            candidate: ev.candidate ? ev.candidate.toJSON() : { completed: true },
          });
        };

        const offer = await publisherPc.createOffer();
        await publisherPc.setLocalDescription(offer);

        const answerMsg = await client.request<Extract<WSEnvelope, { type: "publish_answer" }>>(
          "publish_offer",
          {
            jsep: {
              type: publisherPc.localDescription!.type,
              sdp: publisherPc.localDescription!.sdp,
            },
          },
          "publish_answer",
        );
        if (cancelled) return;

        await publisherPc.setRemoteDescription(answerMsg.payload.jsep);
        for (const cand of publisherIceBuffer.splice(0, publisherIceBuffer.length)) {
          await addIceCandidateSafe(publisherPc, cand);
        }

        for (const p of ready.payload.publishers) {
          if (!p.feed_id || p.feed_id === selfFeedId) continue;
          const meta = feedMetaById.get(p.feed_id);
          if (meta?.kind === "screen") continue;
          ensureSubscriber(p.feed_id).catch(() => {});
        }
      } catch (err) {
        console.error("Voice WebRTC failed", err);
        const msg =
          err instanceof Error
            ? err.message || "Voice WebRTC failed"
            : "Voice WebRTC failed";
        onFatalErrorRef.current?.(msg);
        cleanup();
      }
    })();

    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (!channelId) return null;
  return (
    <>
      {remoteTracks.map((track) => (
        <RemoteAudio
          key={track.feedId}
          stream={track.stream}
          volume={volumeByUserId[track.userId ?? ""] ?? 1}
        />
      ))}
    </>
  );
}
