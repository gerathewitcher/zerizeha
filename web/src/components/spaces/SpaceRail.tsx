"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CreateSpaceModal from "@/components/spaces/CreateSpaceModal";
import Tooltip from "@/components/ui/Tooltip";
import { useMe } from "@/lib/me";
import { useVoiceSession } from "@/components/spaces/VoiceSessionProvider";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import { updateUsername } from "@/lib/api/auth";

type SpaceItem = {
  id: string;
  name: string;
};

type SpaceRailProps = {
  spaces: SpaceItem[];
  isAdmin?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onLogout?: () => void;
  loggingOut?: boolean;
  activeVoiceSpaceId?: string | null;
};

export default function SpaceRail({
  spaces,
  isAdmin,
  mobileOpen = false,
  onCloseMobile,
  onLogout,
  loggingOut = false,
  activeVoiceSpaceId = null,
}: SpaceRailProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "account" | "admin" | "av"
  >("account");
  const [avTab, setAvTab] = useState<"audio" | "video">("audio");
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [micTestActive, setMicTestActive] = useState(false);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAudioRef = useRef<HTMLAudioElement | null>(null);
  const micTestPrevStateRef = useRef<{
    micMuted: boolean;
    incomingMuted: boolean;
  } | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const pathname = usePathname();
  const meState = useMe();
  const voiceSession = useVoiceSession();
  const resolvedIsAdmin =
    typeof isAdmin === "boolean"
      ? isAdmin
      : meState.state.status === "ready"
        ? !!meState.state.me.is_admin
        : false;
  const profileName =
    meState.state.status === "ready" ? meState.state.me.username || "User" : "User";
  const profileInitial = profileName.trim().slice(0, 1).toUpperCase() || "U";
  const maxUsernameLength = 20;
  const hasVoice = !!voiceSession.activeVoiceChannelId;
  const qualityLabel = !voiceSession.voiceReady
    ? "Подключение"
    : voiceSession.connectionQuality === "good"
      ? "Хорошая связь"
      : voiceSession.connectionQuality === "ok"
        ? "Средняя связь"
        : voiceSession.connectionQuality === "bad"
          ? "Плохая связь"
          : "Связь неизвестна";
  const qualityClass = (() => {
    if (!voiceSession.voiceReady) return "text-sky-400";
    switch (voiceSession.connectionQuality) {
      case "good":
        return "text-emerald-400";
      case "ok":
        return "text-amber-400";
      case "bad":
        return "text-red-400";
      default:
        return "text-(--border)";
    }
  })();
  const formatPttKey = (code: string) => {
    if (code === "Mouse4") return "Mouse 4";
    if (code === "Mouse5") return "Mouse 5";
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code === "Space") return "Space";
    if (code.startsWith("Arrow")) return code.replace("Arrow", "Arrow ");
    return code;
  };

  useEffect(() => {
    if (!settingsOpen) return;
    if (meState.state.status !== "ready") return;
    setUsernameDraft(meState.state.me.username || "");
    setUsernameError(null);
  }, [meState.state, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    if (settingsSection !== "av") return;
    setAvTab("audio");
  }, [settingsOpen, settingsSection]);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "av") return;
    let cancelled = false;
    const loadDevices = async () => {
      setAudioLoading(true);
      setAudioError(null);
      try {
        const first = await navigator.mediaDevices.enumerateDevices();
        const needsPermission = first.some(
          (device) => device.kind === "audioinput" && !device.label,
        );
        if (needsPermission) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
          } catch {
            // ignore
          }
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
        setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
      } catch {
        if (cancelled) return;
        setAudioError("Не удалось загрузить устройства.");
      } finally {
        if (!cancelled) setAudioLoading(false);
      }
    };
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      void loadDevices();
    }
    return () => {
      cancelled = true;
    };
  }, [settingsOpen, settingsSection]);

  useEffect(() => {
    const audio = micTestAudioRef.current;
    if (!audio) return;
    audio.volume = voiceSession.outputLevel;
  }, [voiceSession.outputLevel]);

  useEffect(() => {
    const audio = micTestAudioRef.current as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (!audio || !audio.setSinkId) return;
    if (!voiceSession.audioOutputDeviceId) return;
    audio.setSinkId(voiceSession.audioOutputDeviceId).catch(() => {});
  }, [voiceSession.audioOutputDeviceId]);

  const stopMicTest = useCallback(() => {
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach((track) => track.stop());
      micTestStreamRef.current = null;
    }
    if (micTestAudioRef.current) {
      micTestAudioRef.current.pause();
      micTestAudioRef.current.srcObject = null;
    }
    if (micTestPrevStateRef.current) {
      voiceSession.setMicMuted(micTestPrevStateRef.current.micMuted);
      voiceSession.setIncomingMuted(micTestPrevStateRef.current.incomingMuted);
      micTestPrevStateRef.current = null;
    }
    setMicTestActive(false);
  }, [voiceSession]);

  const startMicTest = useCallback(async () => {
    if (micTestActive) {
      stopMicTest();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: voiceSession.audioInputDeviceId
          ? { deviceId: { exact: voiceSession.audioInputDeviceId } }
          : true,
        video: false,
      });
      micTestStreamRef.current = stream;
      const audio = micTestAudioRef.current as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (!audio) throw new Error("audio element missing");
      audio.srcObject = stream;
      audio.volume = voiceSession.outputLevel;
      if (audio.setSinkId && voiceSession.audioOutputDeviceId) {
        await audio.setSinkId(voiceSession.audioOutputDeviceId);
      }
      if (voiceSession.activeVoiceChannelId) {
        micTestPrevStateRef.current = {
          micMuted: voiceSession.micMuted,
          incomingMuted: voiceSession.incomingMuted,
        };
        voiceSession.setMicMuted(true);
        voiceSession.setIncomingMuted(true);
      }
      await audio.play();
      setMicTestActive(true);
    } catch {
      setAudioError("Не удалось запустить проверку микрофона.");
      stopMicTest();
    }
  }, [
    micTestActive,
    stopMicTest,
    voiceSession,
  ]);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "av") {
      if (micTestActive) stopMicTest();
    }
  }, [micTestActive, settingsOpen, settingsSection, stopMicTest]);

  const handleUsernameChange = (value: string) => {
    setUsernameDraft(value);
    if (value.trim().length === 0) {
      setUsernameError("Имя не может быть пустым.");
      return;
    }
    if (value.length > maxUsernameLength) {
      setUsernameError(`Максимум ${maxUsernameLength} символов.`);
      return;
    }
    setUsernameError(null);
  };

  const handleUsernameSave = async () => {
    if (usernameSaving) return;
    if (usernameError) return;
    const nextName = usernameDraft.trim();
    if (!nextName) {
      setUsernameError("Имя не может быть пустым.");
      return;
    }
    setUsernameSaving(true);
    try {
      await updateUsername(nextName);
      meState.refresh();
    } catch {
      setUsernameError("Не удалось сохранить имя.");
    } finally {
      setUsernameSaving(false);
    }
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Закрыть список пространств"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={`h-full flex-col border-r border-(--border) bg-(--bg-2) py-6 transition-all ${
          mobileOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-72 px-4"
            : "hidden"
        } lg:static lg:z-auto lg:flex lg:w-20 lg:items-center lg:px-2`}
      >
      <div className="flex items-center gap-2 px-2">
        <Link
          href="/spaces"
          aria-label="Домой"
          className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
            pathname === "/spaces"
              ? "border-(--accent) text-(--accent)"
              : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
          }`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2.5 7.2L8 2.5L13.5 7.2V13.2C13.5 13.7 13.1 14.1 12.6 14.1H9.9V10.2H6.1V14.1H3.4C2.9 14.1 2.5 13.7 2.5 13.2V7.2Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        {mobileOpen ? (
          <button
            type="button"
            className="ml-auto rounded-full border border-(--border) px-2 py-1 text-xs text-(--muted) transition hover:text-(--accent)"
            onClick={onCloseMobile}
          >
            Закрыть
          </button>
        ) : null}
      </div>
      <div className="mt-9 flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pt-2 pb-2">
        {spaces.map((space) => {
          const href = `/spaces/${space.id}`;
          const isActive =
            pathname === href ||
            (pathname?.startsWith(`/spaces/${space.id}/`) ?? false);

            return (
              <div key={space.id} className="relative">
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-12 items-center gap-3 rounded-2xl text-sm font-semibold transition ${
                  isActive
                    ? "bg-(--accent) text-black"
                    : "bg-(--panel) text-(--muted) hover:text-(--accent)"
                } w-12 justify-center`}
                >
                  <span className="text-base">
                    {space.name.slice(0, 1).toUpperCase()}
                  </span>
                </Link>
                {activeVoiceSpaceId === space.id ? (
                  <span className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-(--bg-2) bg-(--accent)" />
                ) : null}
              </div>
            );
          })}
        <Tooltip label="Создать пространство" side="right">
          <button
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
            onClick={() => setCreateOpen(true)}
            aria-label="Создать пространство"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </Tooltip>
      </div>
      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
          <button
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
            aria-label="Закрыть настройки"
          />
          <div className="relative flex h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-(--border) bg-(--panel) shadow-(--shadow-2)">
            <aside className="flex w-64 flex-col border-r border-(--border) bg-(--panel)">
              <div className="px-5 py-5">
                <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Настройки
                </p>
                <h3 className="mt-2 font-(--font-display) text-xl">
                  {meState.state.status === "ready"
                    ? meState.state.me.username || "Профиль"
                    : "Профиль"}
                </h3>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-4">
                <button
                  type="button"
                  onClick={() => setSettingsSection("account")}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition ${
                    settingsSection === "account"
                      ? "border-(--accent) text-(--accent)"
                      : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                  }`}
                >
                  <span className="text-base">👤</span>
                  Учетная запись
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsSection("av")}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition ${
                    settingsSection === "av"
                      ? "border-(--accent) text-(--accent)"
                      : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                  }`}
                >
                  <span className="text-base">🎚️</span>
                  Аудио и видео
                </button>
                {resolvedIsAdmin ? (
                  <button
                    type="button"
                    onClick={() => setSettingsSection("admin")}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition ${
                      settingsSection === "admin"
                        ? "border-(--accent) text-(--accent)"
                        : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                    }`}
                  >
                    <span className="text-base">⚙</span>
                    Админ панель
                  </button>
                ) : null}
              </div>
              {onLogout ? (
                <div className="border-t border-(--border) p-4">
                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2 rounded-xl border border-(--danger) px-3 py-2 text-[11px] text-(--danger) transition hover:border-red-500/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="text-sm">⤴</span>
                    {loggingOut ? "Выход..." : "Выйти"}
                  </button>
                </div>
              ) : null}
            </aside>
            <section className="flex-1 overflow-y-auto px-8 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                    {settingsSection === "admin"
                      ? "Admin"
                      : settingsSection === "av"
                        ? "Аудио и видео"
                        : "Профиль"}
                  </p>
                  <h4 className="mt-2 font-(--font-display) text-2xl">
                    {settingsSection === "admin"
                      ? "Пользователи"
                      : settingsSection === "av"
                        ? "Аудио и видео"
                        : "Учетная запись"}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-xl border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:text-(--accent)"
                >
                  Закрыть
                </button>
              </div>

              <div className="mt-6">
                {settingsSection === "account" ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                        Профиль
                      </p>
                      <div className="mt-4 grid gap-4 text-sm">
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                              Username
                            </p>
                            <span className="text-xs text-(--subtle)">
                              {usernameDraft.length}/{maxUsernameLength}
                            </span>
                          </div>
                          <input
                            value={usernameDraft}
                            onChange={(event) => handleUsernameChange(event.target.value)}
                            maxLength={maxUsernameLength}
                            placeholder="Введите username"
                            className="mt-3 w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent)"
                          />
                          {usernameError ? (
                            <p className="mt-2 text-xs text-(--danger)">
                              {usernameError}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={handleUsernameSave}
                            disabled={
                              usernameSaving ||
                              !!usernameError ||
                              usernameDraft.trim() === profileName
                            }
                            className="mt-3 rounded-xl border border-(--border) px-4 py-2 text-xs uppercase tracking-[0.2em] text-(--muted) transition hover:border-(--accent) hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {usernameSaving ? "Сохранение…" : "Сохранить"}
                          </button>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                            Email
                          </p>
                          <p className="mt-1 text-(--text)">
                            {meState.state.status === "ready"
                              ? meState.state.me.email || "—"
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : settingsSection === "av" ? (
                  <div className="space-y-4">
                    <div className="flex gap-2 rounded-2xl border border-(--border) bg-(--bg-2) p-2">
                      <button
                        type="button"
                        onClick={() => setAvTab("audio")}
                        className={`flex-1 rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${
                          avTab === "audio"
                            ? "border-(--accent) text-(--accent)"
                            : "border-transparent text-(--muted) hover:text-(--accent)"
                        }`}
                      >
                        Аудио
                      </button>
                      <button
                        type="button"
                        onClick={() => setAvTab("video")}
                        className={`flex-1 rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${
                          avTab === "video"
                            ? "border-(--accent) text-(--accent)"
                            : "border-transparent text-(--muted) hover:text-(--accent)"
                        }`}
                      >
                        Видео
                      </button>
                    </div>
                    {avTab === "audio" ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                            Устройства
                          </p>
                          {audioError ? (
                            <p className="mt-3 text-xs text-(--danger)">{audioError}</p>
                          ) : null}
                          <div className="mt-4 grid gap-4 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                                Устройство ввода
                              </p>
                              <select
                                className="mt-2 w-full rounded-xl border border-(--border) bg-(--bg-2) px-3 py-2 text-sm text-(--text) outline-none transition focus:border-(--accent)"
                                value={voiceSession.audioInputDeviceId ?? ""}
                                onChange={(event) =>
                                  voiceSession.setAudioInputDeviceId(
                                    event.target.value || null,
                                  )
                                }
                                disabled={audioLoading}
                              >
                                <option value="">По умолчанию</option>
                                {audioInputs.map((device, idx) => (
                                  <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Микрофон ${idx + 1}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                                Устройство вывода
                              </p>
                              <select
                                className="mt-2 w-full rounded-xl border border-(--border) bg-(--bg-2) px-3 py-2 text-sm text-(--text) outline-none transition focus:border-(--accent)"
                                value={voiceSession.audioOutputDeviceId ?? ""}
                                onChange={(event) =>
                                  voiceSession.setAudioOutputDeviceId(
                                    event.target.value || null,
                                  )
                                }
                                disabled={audioLoading || audioOutputs.length === 0}
                              >
                                <option value="">По умолчанию</option>
                                {audioOutputs.map((device, idx) => (
                                  <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Вывод ${idx + 1}`}
                                  </option>
                                ))}
                              </select>
                              {audioOutputs.length === 0 ? (
                                <p className="mt-2 text-xs text-(--subtle)">
                                  Выбор устройства вывода недоступен в этом окружении.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                            Громкость
                          </p>
                          <div className="mt-4 grid gap-4 text-sm">
                            <div>
                              <div className="flex items-center justify-between text-xs text-(--subtle)">
                                <span>Микрофон</span>
                                <span>{Math.round(voiceSession.micLevel * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(voiceSession.micLevel * 100)}
                                onChange={(event) =>
                                  voiceSession.setMicLevel(
                                    Number(event.target.value) / 100,
                                  )
                                }
                                className="mt-2 w-full accent-(--accent)"
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs text-(--subtle)">
                                <span>Воспроизведение</span>
                                <span>{Math.round(voiceSession.outputLevel * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round(voiceSession.outputLevel * 100)}
                                onChange={(event) =>
                                  voiceSession.setOutputLevel(
                                    Number(event.target.value) / 100,
                                  )
                                }
                                className="mt-2 w-full accent-(--accent)"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                            Проверка микрофона
                          </p>
                          <p className="mt-2 text-xs text-(--muted)">
                            Во время проверки микрофон и звук в канале будут отключены.
                          </p>
                          <button
                            type="button"
                            onClick={startMicTest}
                            className={`mt-4 rounded-xl border px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                              micTestActive
                                ? "border-(--danger) text-(--danger)"
                                : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                            }`}
                          >
                            {micTestActive ? "Остановить" : "Начать проверку"}
                          </button>
                          <audio ref={micTestAudioRef} className="hidden" />
                        </div>
                        {voiceSession.pttAvailable ? (
                          <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                              Push-to-talk
                            </p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <div className="text-sm">
                                {voiceSession.pttEnabled
                                  ? voiceSession.micMuted
                                    ? "Микрофон выключен"
                                    : voiceSession.pttActive
                                      ? "Говорите…"
                                      : "Удерживайте для речи"
                                  : "Отключено"}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  voiceSession.setPttEnabled(!voiceSession.pttEnabled)
                                }
                                className={`rounded-full border px-3 py-1 text-xs transition ${
                                  voiceSession.pttEnabled
                                    ? "border-(--accent) text-(--accent)"
                                    : "border-(--border) text-(--muted) hover:text-(--accent)"
                                }`}
                              >
                                {voiceSession.pttEnabled ? "Вкл" : "Выкл"}
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-(--muted)">
                              <span>
                                Клавиша:{" "}
                                <span className="text-(--text)">
                                  {formatPttKey(voiceSession.pttKey) || "Не задана"}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => voiceSession.setCapturingPttKey(true)}
                                className="rounded-full border border-(--border) px-2 py-1 text-xs text-(--muted) transition hover:text-(--accent)"
                              >
                                {voiceSession.capturingPttKey
                                  ? "Нажмите клавишу или кнопку мыши…"
                                  : "Изменить"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-(--border) bg-(--panel) px-5 py-4 text-sm text-(--muted)">
                        Видеонастройки появятся позже.
                      </div>
                    )}
                  </div>
                ) : (
                  <AdminUsersPanel />
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
      </aside>
      <div className="fixed bottom-6 left-6 z-50 hidden w-[340px] flex-col gap-2 rounded-2xl border border-(--border) bg-(--panel) px-3 py-2 shadow-(--shadow-2) lg:flex">
        {hasVoice ? (
          <div className="flex flex-col gap-2 border-b border-(--border)/60 pb-2">
            <div className="flex items-center gap-2">
              <Tooltip label={qualityLabel} side="right">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl border border-(--border) ${qualityClass}`}
                  aria-label={qualityLabel}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 11C4.2 9.6 5.8 8.8 8 8.8C10.2 8.8 11.8 9.6 13 11"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                    <path
                      d="M5 13C5.9 11.9 6.8 11.4 8 11.4C9.2 11.4 10.1 11.9 11 13"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                    <path
                      d="M1 9C2.7 6.9 5 5.8 8 5.8C11 5.8 13.3 6.9 15 9"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </Tooltip>
              <div className="min-w-0 flex-1 text-[12px] text-(--muted)">
                <span className="truncate">
                  {(voiceSession.activeVoiceChannelName || "Голосовой канал") +
                    " / " +
                    (voiceSession.activeVoiceSpaceName || "Пространство")}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
              <Tooltip
                label={
                  voiceSession.screenShareEnabled
                    ? "Остановить экран"
                    : "Показать экран"
                }
                side="top"
              >
                <button
                  type="button"
                  onClick={() => voiceSession.toggleScreenShare()}
                  disabled={!voiceSession.voiceReady}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                    voiceSession.screenShareEnabled
                      ? "border-(--accent) text-(--accent)"
                      : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label="Шаринг экрана"
                >
                  <svg
                    className="h-5 w-5"
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
              <Tooltip label="Отключиться" side="top">
                <button
                  type="button"
                  onClick={() => void voiceSession.leaveVoiceChannel()}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-(--danger) text-(--danger) transition hover:border-red-500/80"
                  aria-label="Отключиться"
                >
                  <svg
                    className="h-5 w-5"
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
          </div>
        ) : null}
        <div className="flex w-full items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--bg-2) text-sm font-semibold">
            {profileInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{profileName}</div>
            <div className="text-xs text-(--muted)">
              {resolvedIsAdmin ? "admin" : "user"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip
              label={
                voiceSession.micMuted ? "Включить микрофон" : "Выключить микрофон"
              }
              side="top"
            >
              <button
                type="button"
                onClick={() => voiceSession.setMicMuted(!voiceSession.micMuted)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                  voiceSession.micMuted
                    ? "border-(--danger) text-(--danger)"
                    : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                }`}
                aria-label="Микрофон"
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
                <path d="M8 11.6V13.2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6.3 13.2H9.7" stroke="currentColor" strokeWidth="1.2" />
                {voiceSession.micMuted ? (
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
            <Tooltip
              label={
                voiceSession.incomingMuted ? "Включить звук" : "Выключить звук"
              }
              side="top"
            >
              <button
                type="button"
                onClick={() =>
                  voiceSession.setIncomingMuted(!voiceSession.incomingMuted)
                }
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                  voiceSession.incomingMuted
                    ? "border-(--danger) text-(--danger)"
                    : "border-(--border) text-(--muted) hover:border-(--accent) hover:text-(--accent)"
                }`}
                aria-label="Звук"
              >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6 5H3.5C3 5 2.6 5.4 2.6 5.9V10.1C2.6 10.6 3 11 3.5 11H6L9.6 13V3L6 5Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                {voiceSession.incomingMuted ? (
                  <path
                    d="M11.5 5.5L13.8 7.8M13.8 5.5L11.5 7.8"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                ) : (
                  <>
                    <path
                      d="M11.2 6.1C11.8 6.7 12.1 7.3 12.1 8C12.1 8.7 11.8 9.3 11.2 9.9"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                    <path
                      d="M12.6 4.8C13.6 5.8 14.1 6.8 14.1 8C14.1 9.2 13.6 10.2 12.6 11.2"
                      stroke="currentColor"
                      strokeWidth="1.1"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
              </button>
            </Tooltip>
            <Tooltip label="Настройки" side="top">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent)"
                onClick={() => {
                  setSettingsSection("account");
                  setSettingsOpen(true);
                }}
                aria-label="Настройки"
              >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M8 3.5C8.4 3.5 8.7 3.8 8.7 4.2V5.1C9 5.2 9.2 5.3 9.5 5.5L10.2 5.1C10.6 4.9 11.1 5 11.3 5.4L11.9 6.4C12.1 6.7 12 7.2 11.6 7.4L10.9 7.8C10.9 8 10.9 8.2 10.9 8.4L11.6 8.8C12 9 12.1 9.5 11.9 9.8L11.3 10.8C11.1 11.2 10.6 11.3 10.2 11.1L9.5 10.7C9.2 10.9 9 11 8.7 11.1V12C8.7 12.4 8.4 12.7 8 12.7H7C6.6 12.7 6.3 12.4 6.3 12V11.1C6 11 5.8 10.9 5.5 10.7L4.8 11.1C4.4 11.3 3.9 11.2 3.7 10.8L3.1 9.8C2.9 9.5 3 9 3.4 8.8L4.1 8.4C4.1 8.2 4.1 8 4.1 7.8L3.4 7.4C3 7.2 2.9 6.7 3.1 6.4L3.7 5.4C3.9 5 4.4 4.9 4.8 5.1L5.5 5.5C5.8 5.3 6 5.2 6.3 5.1V4.2C6.3 3.8 6.6 3.5 7 3.5H8Z"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                />
                <circle
                  cx="7.9"
                  cy="8"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
              </svg>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  );
}
