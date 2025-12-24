"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SpaceRail from "@/components/spaces/SpaceRail";
import { fetchSpaces } from "@/lib/api/spaces";
import ErrorState from "@/components/ui/ErrorState";
import { getHttpStatus } from "@/lib/api/errors";
import { useMe } from "@/lib/me";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";
import type { Space } from "@/lib/api/generated/zerizeha-schemas";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; serverError: boolean }
  | { status: "ready"; spaces: Space[] };

export default function SpacesPage() {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const meState = useMe();

  const loadSpaces = useCallback(() => {
    const controller = new AbortController();

    setState({ status: "loading" });
    fetchSpaces(controller.signal)
      .then((spaces) => setState({ status: "ready", spaces }))
      .catch((err) => {
        console.error("Failed to load spaces", err);
        if (redirectIfAuthOrOnboardingError(err)) return;
        const status = getHttpStatus(err);
        setState({
          status: "error",
          serverError: typeof status === "number" && status >= 500,
          message:
            typeof status === "number" && status >= 500
              ? "Сервер временно недоступен. Попробуйте повторить позже."
              : "Не удалось загрузить пространства. Попробуйте обновить.",
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => loadSpaces(), [loadSpaces]);

  const railSpaces = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.spaces.map((space) => ({ id: space.id, name: space.name }));
  }, [state]);

  const profile = useMemo(() => {
    if (meState.state.status !== "ready") return null;
    const name = meState.state.me.username || "user";
    const initial = name.trim().slice(0, 1).toUpperCase() || "U";
    return {
      username: name,
      email: meState.state.me.email ?? "",
      initial,
      isAdmin: !!meState.state.me.is_admin,
    };
  }, [meState.state]);

  const profileSkeleton = (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-(--border) bg-(--panel) p-6 text-left shadow-(--shadow-2)">
      <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
        Профиль
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-(--bg-2)" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-(--bg-2)" />
          <div className="h-4 w-56 animate-pulse rounded bg-(--bg-2)" />
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <div className="md:hidden">
        <main className="px-5 py-6">
          {meState.state.status === "loading" ? (
            <div className="rounded-2xl border border-(--border) bg-(--panel) p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 animate-pulse rounded-2xl bg-(--bg-2)" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-(--bg-2)" />
                  <div className="h-3 w-24 animate-pulse rounded bg-(--bg-2)" />
                </div>
              </div>
            </div>
          ) : profile ? (
            <div className="rounded-2xl border border-(--border) bg-(--panel) p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--bg-2) text-lg font-semibold">
                  {profile.initial}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-(--font-display) text-lg">
                      {profile.username}
                    </p>
                    {profile.isAdmin ? (
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
                  <p className="text-xs text-(--subtle)">Твой профиль</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Пространства
            </p>
            <div className="mt-3 space-y-2">
              {state.status === "loading" ? (
                <p className="text-sm text-(--muted)">Загрузка…</p>
              ) : state.status === "error" ? (
                <ErrorState
                  title={state.serverError ? "Сервис недоступен" : "Ошибка"}
                  message={state.message}
                  onAction={loadSpaces}
                />
              ) : state.spaces.length ? (
                state.spaces.map((space) => (
                  <Link
                    key={space.id}
                    href={`/spaces/${space.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--panel) px-4 py-3 text-sm font-semibold transition hover:border-(--accent) hover:text-(--accent)"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-(--bg-2) text-base">
                        {space.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="truncate">{space.name}</span>
                    </div>
                    <span className="text-xs text-(--subtle)">Открыть</span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-(--muted)">
                  Пока нет пространств. Создай первое.
                </p>
              )}
            </div>
          </div>
        </main>
      </div>

      <div className="hidden h-screen overflow-hidden md:flex">
        <SpaceRail spaces={railSpaces} defaultExpanded />
        <main className="flex min-w-0 flex-1 items-center justify-center px-6">
          {state.status === "loading" ? (
            <p className="text-sm text-(--muted)">Загрузка…</p>
          ) : state.status === "error" ? (
            <ErrorState
              title={state.serverError ? "Сервис недоступен" : "Ошибка"}
              message={state.message}
              onAction={loadSpaces}
            />
          ) : (
            <div className="w-full max-w-xl space-y-10 text-center">
              {meState.state.status === "loading"
                ? profileSkeleton
                : profile
                  ? (
                      <section className="mx-auto w-full max-w-md rounded-2xl border border-(--border) bg-(--panel) p-6 text-left shadow-(--shadow-2)">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                          Профиль
                        </p>
                        <div className="mt-4 flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--bg-2) text-lg font-semibold">
                            {profile.initial}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-(--font-display) text-xl">
                                {profile.username}
                              </p>
                              {profile.isAdmin ? (
                                <span
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-(--border) bg-(--bg-2) text-(--accent)"
                                  title="Админ"
                                  aria-label="Админ"
                                >
                                  <svg
                                    className="h-4 w-4"
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
                            {profile.email ? (
                              <p className="truncate text-sm text-(--muted)">
                                {profile.email}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    )
                  : null}

              {state.spaces.length ? (
                <div className="space-y-3">
                  <h1 className="font-(--font-display) text-4xl tracking-tight">
                    Выбери пространство
                  </h1>
                  <p className="text-sm text-(--muted)">
                    Нажми на пространство слева, чтобы открыть каналы.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <h1 className="font-(--font-display) text-4xl tracking-tight">
                    Пока пусто
                  </h1>
                  <p className="text-sm text-(--muted)">
                    Создай первое пространство в левом меню.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
