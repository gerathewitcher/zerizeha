"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bootstrapVoiceWebRTC } from "@/lib/api/voice";
import { buildWebSocketUrl } from "@/lib/api/ws";

type WebRTCJSEP = { type: RTCSdpType; sdp: string };

type WSEnvelope =
  | { type: "ready"; payload: { publishers: Array<{ feed_id: string; display?: string | null }> } }
  | { type: "publisher_joined"; payload: { feed_id: string; display?: string | null } }
  | { type: "publisher_left"; payload: { feed_id: string } }
  | { type: "publish_answer"; request_id: string; payload: { jsep: WebRTCJSEP } }
  | { type: "subscribe_offer"; request_id: string; payload: { feed_id: string; jsep: WebRTCJSEP } }
  | { type: "subscribe_answer_ack"; request_id: string }
  | { type: "trickle"; payload: { target: "publisher" | "subscriber"; feed_id?: string; candidate: any } }
  | { type: "trickle_ack"; request_id: string }
  | { type: "error"; request_id?: string; payload?: { message?: string } }
  | { type: string; request_id?: string; payload?: any };

type RemoteTrack = { feedId: string; stream: MediaStream };

function RemoteAudio({ stream }: { stream: MediaStream }) {
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
  videoEnabled?: boolean;
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (userId: string, stream: MediaStream) => void;
  onRemoteStreamRemoved?: (userId: string) => void;
  onCameraError?: (message: string | null) => void;
  onFatalError?: (message: string) => void;
};

export default function VoiceWebRTC({
  channelId,
  onSpeaking,
  selfUserId,
  videoEnabled = false,
  onLocalStream,
  onRemoteStream,
  onRemoteStreamRemoved,
  onCameraError,
  onFatalError,
}: VoiceWebRTCProps) {
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const remoteTracksByFeed = useMemo(() => {
    const map = new Map<string, MediaStream>();
    for (const t of remoteTracks) map.set(t.feedId, t.stream);
    return map;
  }, [remoteTracks]);

  const onSpeakingRef = useRef<VoiceWebRTCProps["onSpeaking"]>(onSpeaking);
  useEffect(() => {
    onSpeakingRef.current = onSpeaking;
  }, [onSpeaking]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const publisherPcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);

  const selfUserIdRef = useRef<string | null | undefined>(selfUserId);
  useEffect(() => {
    selfUserIdRef.current = selfUserId;
  }, [selfUserId]);

  const videoEnabledRef = useRef<boolean>(videoEnabled);
  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
    const stream = localStreamRef.current;
    if (stream) {
      for (const t of stream.getVideoTracks()) t.enabled = videoEnabled;
    }
    // Stop sending video RTP when disabled (Firefox otherwise keeps a black frame on receivers).
    const sender = videoSenderRef.current;
    const track = localVideoTrackRef.current;
    if (!sender) return;
    try {
      if (videoEnabled) {
        if (track) void sender.replaceTrack(track);
      } else {
        void sender.replaceTrack(null);
      }
    } catch {
      // ignore
    }
  }, [videoEnabled]);

  const onLocalStreamRef = useRef<VoiceWebRTCProps["onLocalStream"]>(onLocalStream);
  useEffect(() => {
    onLocalStreamRef.current = onLocalStream;
  }, [onLocalStream]);

  const onRemoteStreamRef = useRef<VoiceWebRTCProps["onRemoteStream"]>(onRemoteStream);
  useEffect(() => {
    onRemoteStreamRef.current = onRemoteStream;
  }, [onRemoteStream]);

  const onRemoteStreamRemovedRef = useRef<VoiceWebRTCProps["onRemoteStreamRemoved"]>(
    onRemoteStreamRemoved,
  );
  useEffect(() => {
    onRemoteStreamRemovedRef.current = onRemoteStreamRemoved;
  }, [onRemoteStreamRemoved]);

  const onCameraErrorRef = useRef<VoiceWebRTCProps["onCameraError"]>(onCameraError);
  useEffect(() => {
    onCameraErrorRef.current = onCameraError;
  }, [onCameraError]);

  const onFatalErrorRef = useRef<VoiceWebRTCProps["onFatalError"]>(onFatalError);
  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
  }, [onFatalError]);

  useEffect(() => {
    if (!channelId) {
      setRemoteTracks([]);
      return;
    }

    let cancelled = false;
    const publisherPc = new RTCPeerConnection();
    publisherPcRef.current = publisherPc;
    const subscriberPcs = new Map<string, RTCPeerConnection>();
    const subscriberIceBuffer = new Map<string, any[]>();
    const publisherIceBuffer: any[] = [];
    const displayByFeedId = new Map<string, string>();
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
    let localStreamReported = false;
    let client: SignalingClient | null = null;
    let ws: WebSocket | null = null;
    let selfFeedId = "";

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
        for (const userId of displayByFeedId.values()) notify(userId, false);
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
      localVideoTrackRef.current = null;
      videoSenderRef.current = null;

      if (localStream) {
        for (const t of localStream.getTracks()) t.stop();
      }
      localStream = null;
      localStreamRef.current = null;
      if (localStreamReported) {
        onLocalStreamRef.current?.(null);
      }
      onCameraErrorRef.current?.(null);
      setRemoteTracks([]);
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

      const pc = new RTCPeerConnection();
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

        // RMS-based speaking detection for this remote stream, without routing audio to output.
        startRmsMeter(feedId, stream, () => displayByFeedId.get(feedId) ?? null).catch(() => {});

        const userId = displayByFeedId.get(feedId);
        if (userId) onRemoteStreamRef.current?.(userId, stream);

        setRemoteTracks((prev) => {
          const next = prev.filter((t) => t.feedId !== feedId);
          next.push({ feedId, stream: stream! });
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

    (async () => {
      try {
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
              target: "publisher" | "subscriber";
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
              displayByFeedId.set(feedId, display);
              const existing = remoteStreamByFeedId.get(feedId);
              if (existing) onRemoteStreamRef.current?.(display, existing);
            }
            if (feedId) ensureSubscriber(feedId).catch(() => {});
            return;
          }

          if (msg.type === "publisher_left") {
            const feedId = (msg as any).payload?.feed_id as string | undefined;
            if (!feedId) return;
            const userId = displayByFeedId.get(feedId);
            const notify = onSpeakingRef.current;
            if (userId && notify) notify(userId, false);
            if (userId) onRemoteStreamRemovedRef.current?.(userId);
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
          if (p.feed_id && p.display) displayByFeedId.set(p.feed_id, p.display);
        }

        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
              frameRate: { ideal: 15, max: 30 },
            },
          });
          onCameraErrorRef.current?.(null);
        } catch (e) {
          const err = e as DOMException | Error;
          const name = (err as any)?.name as string | undefined;
          let msg = "Не удалось получить доступ к камере.";
          if (name === "NotReadableError" || name === "AbortError") {
            msg = "Камера занята другим приложением или вкладкой.";
          } else if (name === "NotAllowedError") {
            msg = "Доступ к камере запрещён. Проверь разрешения браузера.";
          } else if (name === "NotFoundError") {
            msg = "Камера не найдена.";
          } else if (name === "OverconstrainedError") {
            msg = "Камера не поддерживает запрошенные параметры.";
          }
          onCameraErrorRef.current?.(msg);
          // Fallback to audio-only if camera permission/device is unavailable.
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        }
        if (cancelled) return;
        localStreamRef.current = localStream;

        // Local speaking indicator works even when you're alone.
        startRmsMeter(
          "__self__",
          localStream,
          () => selfUserIdRef.current ?? null,
        ).catch(() => {});

        onLocalStreamRef.current?.(localStream);
        localStreamReported = true;

        // Add tracks; keep a handle to the video sender for replaceTrack(null) toggling.
        const audioTrack = localStream.getAudioTracks()[0] ?? null;
        const videoTrack = localStream.getVideoTracks()[0] ?? null;

        if (audioTrack) {
          publisherPc.addTrack(audioTrack, localStream);
        }
        if (videoTrack) {
          localVideoTrackRef.current = videoTrack;
          videoTrack.enabled = videoEnabledRef.current;
          const sender = publisherPc.addTrack(videoTrack, localStream);
          videoSenderRef.current = sender;
          if (!videoEnabledRef.current) {
            try {
              void sender.replaceTrack(null);
            } catch {
              // ignore
            }
          }
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
          { jsep: { type: publisherPc.localDescription!.type, sdp: publisherPc.localDescription!.sdp } },
          "publish_answer",
        );
        if (cancelled) return;

        await publisherPc.setRemoteDescription(answerMsg.payload.jsep);
        for (const cand of publisherIceBuffer.splice(0, publisherIceBuffer.length)) {
          await addIceCandidateSafe(publisherPc, cand);
        }

        for (const p of ready.payload.publishers) {
          if (!p.feed_id || p.feed_id === selfFeedId) continue;
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
      {Array.from(remoteTracksByFeed.entries()).map(([feedId, stream]) => (
        <RemoteAudio key={feedId} stream={stream} />
      ))}
    </>
  );
}
