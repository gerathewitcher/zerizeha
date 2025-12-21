"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SpaceRail from "@/components/spaces/SpaceRail";
import { fetchSpaces } from "@/lib/api/spaces";
import ErrorState from "@/components/ui/ErrorState";
import { getHttpStatus } from "@/lib/api/errors";
import type { Space } from "@/lib/api/generated/zerizeha-schemas";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; serverError: boolean }
  | { status: "ready"; spaces: Space[] };

export default function SpacesPage() {
  const [state, setState] = useState<ViewState>({ status: "loading" });

  const loadSpaces = useCallback(() => {
    const controller = new AbortController();

    setState({ status: "loading" });
    fetchSpaces(controller.signal)
      .then((spaces) => setState({ status: "ready", spaces }))
      .catch((err) => {
        console.error("Failed to load spaces", err);
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

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <div className="flex h-screen overflow-hidden">
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
          ) : state.spaces.length ? (
            <div className="max-w-md space-y-3 text-center">
              <h1 className="font-(--font-display) text-4xl tracking-tight">
                Выбери пространство
              </h1>
              <p className="text-sm text-(--muted)">
                Нажми на пространство слева, чтобы открыть каналы.
              </p>
            </div>
          ) : (
            <div className="max-w-md space-y-3 text-center">
              <h1 className="font-(--font-display) text-4xl tracking-tight">
                Пока пусто
              </h1>
              <p className="text-sm text-(--muted)">
                Создай первое пространство в левом меню.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
