import { useCallback, useEffect, useRef, useState } from "react";

type VoicePanelProps = {
  users: { id: string; username: string; is_admin: boolean }[];
  roomName?: string;
  onLeave?: () => void;
  speakingByUserId?: Record<string, boolean>;
  selfUserId?: string | null;
  videoEnabled?: boolean;
  onToggleVideo?: () => void;
  localMediaStream?: MediaStream | null;
  cameraError?: string | null;
  videoStreamsByUserId?: Record<string, MediaStream>;
};

function VideoTile({
  label,
  stream,
  forceActive = false,
}: {
  label: string;
  stream: MediaStream;
  forceActive?: boolean;
}) {
  const [active, setActive] = useState(false);
  const videoElState = useState<HTMLVideoElement | null>(null);
  const videoEl = videoElState[0];
  const setVideoEl = videoElState[1];
  const lastFrameAtRef = useRef(0);
  const lastCounterRef = useRef(0);
  const firstFrameAtRef = useRef(0);

  useEffect(() => {
    if (forceActive) {
      setActive(true);
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      setActive(false);
      return;
    }

    const updateFromTrack = () => {
      if (track.readyState !== "live") {
        setActive(false);
        return;
      }
      if (track.muted) setActive(false);
    };
    updateFromTrack();

    track.addEventListener("mute", updateFromTrack);
    track.addEventListener("unmute", updateFromTrack);
    track.addEventListener("ended", updateFromTrack);
    return () => {
      track.removeEventListener("mute", updateFromTrack);
      track.removeEventListener("unmute", updateFromTrack);
      track.removeEventListener("ended", updateFromTrack);
    };
  }, [stream, videoEl]);

  useEffect(() => {
    if (forceActive) return;
    const track = stream.getVideoTracks()[0];
    if (!track || !videoEl) {
      setActive(false);
      return;
    }

    const anyVideo = videoEl as any;
    const showAfterMs = 400;
    const hideAfterMs = 2000;
    let lastTime = -1;
    let canceled = false;

    const readCounter = () => {
      if (typeof anyVideo.getVideoPlaybackQuality === "function") {
        const q = anyVideo.getVideoPlaybackQuality();
        if (typeof q?.totalVideoFrames === "number") return q.totalVideoFrames;
      }
      if (typeof anyVideo.mozPresentedFrames === "number") {
        return anyVideo.mozPresentedFrames;
      }
      if (typeof anyVideo.webkitDecodedFrameCount === "number") {
        return anyVideo.webkitDecodedFrameCount;
      }
      // Fallback to currentTime (less reliable for frozen frames).
      const t = videoEl.currentTime;
      if (t !== lastTime && videoEl.videoWidth > 0) {
        lastTime = t;
        return lastCounterRef.current + 1;
      }
      return lastCounterRef.current;
    };

    // Prefer requestVideoFrameCallback when available.
    if (typeof anyVideo.requestVideoFrameCallback === "function") {
      const loop = () => {
        if (canceled) return;
        anyVideo.requestVideoFrameCallback(() => {
          if (canceled) return;
          const counter = readCounter();
          if (counter > lastCounterRef.current) {
            lastCounterRef.current = counter;
            lastFrameAtRef.current = performance.now();
            if (!firstFrameAtRef.current) {
              firstFrameAtRef.current = lastFrameAtRef.current;
            }
          }
          loop();
        });
      };
      loop();
    }

    const interval = window.setInterval(() => {
      if (canceled) return;
      if (track.readyState !== "live" || track.muted) {
        setActive(false);
        firstFrameAtRef.current = 0;
        return;
      }

      const counter = readCounter();
      if (counter > lastCounterRef.current) {
        lastCounterRef.current = counter;
        lastFrameAtRef.current = performance.now();
        if (!firstFrameAtRef.current) {
          firstFrameAtRef.current = lastFrameAtRef.current;
        }
      }

      const now = performance.now();
      if (!active && firstFrameAtRef.current && now - firstFrameAtRef.current >= showAfterMs) {
        setActive(true);
        return;
      }
      if (active && now - lastFrameAtRef.current > hideAfterMs) {
        setActive(false);
        firstFrameAtRef.current = 0;
        return;
      }
    }, 500);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [stream, videoEl, forceActive, active]);

  const ref = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
    if (!el) return;
    el.srcObject = stream;
    el.muted = true;
    const p = el.play();
    if (p) p.catch(() => {});
  }, [stream]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-(--border) bg-(--bg-2) ${
        active ? "" : "hidden"
      }`}
    >
      <video ref={ref} autoPlay playsInline muted className="h-24 w-full object-cover" />
      <div className="absolute bottom-1 left-1 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white">
        {label}
      </div>
    </div>
  );
}

export default function VoicePanel({
  users,
  roomName,
  onLeave,
  speakingByUserId,
  selfUserId,
  videoEnabled,
  onToggleVideo,
  localMediaStream,
  cameraError,
  videoStreamsByUserId,
}: VoicePanelProps) {
  const canToggleVideo =
    !!roomName &&
    !!onToggleVideo &&
    !!localMediaStream?.getVideoTracks().length;

  return (
    <aside className="hidden w-80 flex-col border-l border-(--border) bg-(--panel) xl:flex">
      <div className="border-b border-(--border) px-6 py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
          Голосовая
        </p>
        <h3 className="mt-2 text-lg font-semibold">
          {roomName || "Не подключено"}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {roomName && videoStreamsByUserId ? (
          <div className="mb-6">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Видео
            </p>
            <div className="grid grid-cols-2 gap-3">
              {selfUserId &&
              videoEnabled &&
              localMediaStream &&
              localMediaStream.getVideoTracks().length ? (
                <VideoTile label="Вы" stream={localMediaStream} forceActive />
              ) : null}
              {users
                .filter((u) => u.id !== selfUserId)
                .map((u) => {
                  const s = videoStreamsByUserId[u.id];
                  if (!s || !s.getVideoTracks().length) return null;
                  return <VideoTile key={u.id} label={u.username} stream={s} />;
                })}
            </div>
          </div>
        ) : null}
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
      </div>
      <div className="border-t border-(--border) px-6 py-5">
        {cameraError ? (
          <p className="mb-3 text-xs text-(--muted)">{cameraError}</p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <button className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)">
            Mute
          </button>
          <button
            type="button"
            onClick={onToggleVideo}
            disabled={!canToggleVideo}
            className={`rounded-xl border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
              videoEnabled
                ? "border-(--accent) text-(--accent)"
                : "border-(--border) text-(--muted) hover:text-(--accent)"
            }`}
          >
            Video
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
  );
}
