"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SpaceMembersSection from "@/components/spaces/SpaceMembersSection";
import SpaceRail from "@/components/spaces/SpaceRail";
import SpaceSidebar from "@/components/spaces/SpaceSidebar";
import { useVoiceSession } from "@/components/spaces/VoiceSessionProvider";
import ErrorState from "@/components/ui/ErrorState";
import { logout } from "@/lib/api/auth";
import { fetchChannelsBySpaceId } from "@/lib/api/channels";
import { getHttpStatus } from "@/lib/api/errors";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";
import { fetchSpaceById, fetchSpaces, updateSpaceName } from "@/lib/api/spaces";
import { useMe } from "@/lib/me";
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

export default function SpaceSettingsPage() {
  const meState = useMe();
  const voiceSession = useVoiceSession();
  const params = useParams<{ spaceId?: string | string[] }>();
  const spaceId =
    typeof params.spaceId === "string"
      ? params.spaceId
      : params.spaceId?.[0] ?? "";
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [spaceNameDraft, setSpaceNameDraft] = useState("");
  const [spaceNameError, setSpaceNameError] = useState<string | null>(null);
  const [spaceNameSaving, setSpaceNameSaving] = useState(false);
  const canManageSpace =
    state.status === "ready" &&
    meState.state.status === "ready" &&
    (meState.state.me.is_admin || meState.state.me.id === state.space.author_id);

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
        console.error("Failed to load space settings", err);
        if (redirectIfAuthOrOnboardingError(err)) return;
        const status = getHttpStatus(err);
        setState({
          status: "error",
          serverError: typeof status === "number" && status >= 500,
          message:
            typeof status === "number" && status >= 500
              ? "Сервер временно недоступен. Попробуйте повторить позже."
              : "Не удалось загрузить настройки. Попробуйте обновить.",
        });
      });

    return () => controller.abort();
  }, [spaceId, reloadKey]);

  useEffect(() => {
    if (state.status !== "ready") return;
    setSpaceNameDraft(state.space.name);
    setSpaceNameError(null);
  }, [state]);

  const handleSpaceNameSave = useCallback(async () => {
    if (spaceNameSaving) return;
    const nextName = spaceNameDraft.trim();
    if (!nextName) {
      setSpaceNameError("Название не может быть пустым.");
      return;
    }
    setSpaceNameSaving(true);
    try {
      await updateSpaceName(spaceId, nextName);
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          ...prev,
          space: { ...prev.space, name: nextName },
          spaces: prev.spaces.map((space) =>
            space.id === prev.space.id ? { ...space, name: nextName } : space,
          ),
        };
      });
      setSpaceNameError(null);
    } catch {
      setSpaceNameError("Не удалось сохранить.");
    } finally {
      setSpaceNameSaving(false);
    }
  }, [spaceId, spaceNameDraft, spaceNameSaving]);

  const railSpaces = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.spaces.map((space) => ({ id: space.id, name: space.name }));
  }, [state]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (voiceSession.activeVoiceChannelId) {
        await voiceSession.leaveVoiceChannel();
      }
      await logout();
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      window.location.assign("/login");
    }
  }, [loggingOut, voiceSession]);

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
  }, [
    state.status,
    state.status === "ready" ? state.space.id : "",
    voiceChannels,
    setSpaceVoiceChannels,
  ]);

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <div className="flex h-screen overflow-hidden">
        <SpaceRail
          spaces={railSpaces}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          activeVoiceSpaceId={voiceSession.activeVoiceSpaceId}
        />
        {state.status === "ready" ? (
          <SpaceSidebar
            spaceId={state.space.id}
            spaceName={state.space.name}
            textChannels={textChannels}
            voiceChannels={voiceChannels}
            onChannelsChanged={() => setReloadKey((v) => v + 1)}
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
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-(--border) bg-(--panel) px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <Link
                  href={`/spaces/${spaceId ?? "alpha"}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-(--border) text-(--muted) transition hover:text-(--accent)"
                  aria-label="Назад к пространству"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M10 4L6 8L10 12"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                    Настройки пространства
                  </p>
                  <h1 className="mt-2 font-(--font-display) text-2xl">
                    {state.status === "ready"
                      ? state.space.name
                      : "Zerizeha Studio"}
                  </h1>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {state.status === "ready" &&
            meState.state.status === "ready" &&
            !canManageSpace ? (
              <ErrorState
                title="Нет доступа"
                message="Настройки пространства доступны только создателю и администраторам."
                actionLabel="Вернуться в пространство"
                onAction={() =>
                  window.location.assign(`/spaces/${spaceId ?? ""}`)
                }
              />
            ) : (
            <div className="max-w-3xl space-y-10">
              <section>
                <h2 className="text-lg font-semibold">Основное</h2>
                <p className="mt-2 text-sm text-(--muted)">
                  Управляй названием и визуальным образом пространства.
                </p>
                <div className="mt-6 rounded-2xl border border-(--border) bg-(--panel) p-6">
                  <div className="flex flex-col gap-6 md:flex-row md:items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--bg-2) text-xl font-semibold">
                      Z
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                          Название пространства
                        </label>
                        <input
                          className="mt-3 w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent)"
                          value={spaceNameDraft}
                          onChange={(event) => {
                            setSpaceNameDraft(event.target.value);
                            setSpaceNameError(null);
                          }}
                        />
                        {spaceNameError ? (
                          <p className="mt-2 text-xs text-(--danger)">{spaceNameError}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button className="rounded-xl border border-(--border) px-4 py-2 text-sm text-(--muted) transition hover:text-(--accent)">
                          Загрузить аватар
                        </button>
                        <button
                          className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-black transition hover:bg-(--accent-2) disabled:cursor-not-allowed disabled:opacity-70"
                          onClick={handleSpaceNameSave}
                          disabled={
                            spaceNameSaving ||
                            !spaceNameDraft.trim() ||
                            (state.status === "ready" &&
                              spaceNameDraft.trim() === state.space.name)
                          }
                        >
                          {spaceNameSaving ? "Сохранение…" : "Сохранить"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {state.status === "loading" ? (
                <p className="text-sm text-(--muted)">Загрузка…</p>
              ) : state.status === "error" ? (
                <ErrorState
                  title={state.serverError ? "Сервис недоступен" : "Ошибка"}
                  message={state.message}
                  onAction={() => window.location.reload()}
                />
              ) : (
                <SpaceMembersSection
                  spaceId={spaceId}
                  canManage={
                    meState.state.status === "ready" &&
                    state.status === "ready" &&
                    meState.state.me.id === state.space.author_id
                  }
                />
              )}
            </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
