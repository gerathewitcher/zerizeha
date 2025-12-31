"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ErrorState from "@/components/ui/ErrorState";
import { listAdminUsers, updateAdminUser } from "@/lib/api/generated/zerizeha-components";
import { getHttpStatus } from "@/lib/api/errors";
import type { User } from "@/lib/api/generated/zerizeha-schemas";
import { useMe } from "@/lib/me";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; serverError: boolean }
  | {
      status: "ready";
      users: User[];
      updating: Record<string, boolean>;
      nextCursor?: string;
      query: string;
      loadingMore: boolean;
    };

type AdminUsersPanelProps = {
  onUnauthenticated?: () => void;
  onUnauthorized?: () => void;
};

export default function AdminUsersPanel({
  onUnauthenticated,
  onUnauthorized,
}: AdminUsersPanelProps) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const meState = useMe();
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const handleUnauthenticated = useCallback(() => {
    if (onUnauthenticated) onUnauthenticated();
  }, [onUnauthenticated]);

  const handleUnauthorized = useCallback(() => {
    if (onUnauthorized) onUnauthorized();
  }, [onUnauthorized]);

  const load = useCallback((opts?: { query?: string }) => {
    const controller = new AbortController();
    setState({ status: "loading" });

    const query = opts?.query ?? "";
    listAdminUsers(
      { queryParams: { query: query || undefined, limit: 30 } },
      controller.signal,
    )
      .then((page) =>
        setState({
          status: "ready",
          users: page.items,
          updating: {},
          nextCursor: page.next_cursor,
          query,
          loadingMore: false,
        }),
      )
      .catch((err) => {
        console.error("Failed to load admin users", err);
        const status = getHttpStatus(err);
        if (status === 401) {
          handleUnauthenticated();
          return;
        }
        if (status === 403) {
          handleUnauthorized();
          return;
        }
        setState({
          status: "error",
          serverError: typeof status === "number" && status >= 500,
          message:
            typeof status === "number" && status >= 500
              ? "Сервер временно недоступен. Попробуйте повторить позже."
              : "Не удалось загрузить список пользователей.",
        });
      });

    return () => controller.abort();
  }, [handleUnauthenticated, handleUnauthorized]);

  useEffect(() => {
    if (meState.state.status === "loading") return;
    if (meState.state.status === "error") {
      if (meState.state.httpStatus === 401) {
        handleUnauthenticated();
        return;
      }
    }
    if (meState.state.status === "ready" && !meState.state.me.is_admin) {
      handleUnauthorized();
      return;
    }
    if (meState.state.status === "ready" && meState.state.me.is_admin) {
      load();
    }
  }, [
    handleUnauthenticated,
    handleUnauthorized,
    load,
    meState.state.httpStatus,
    meState.state.me?.is_admin,
    meState.state.status,
  ]);

  const setQuery = useCallback(
    (value: string) => {
      if (state.status !== "ready") return;
      setState((prev) =>
        prev.status === "ready" ? { ...prev, query: value } : prev,
      );
    },
    [state.status],
  );

  const applyQuery = useCallback(() => {
    if (state.status !== "ready") return;
    load({ query: state.query });
  }, [load, state]);

  const loadMore = useCallback(() => {
    if (state.status !== "ready") return;
    if (!state.nextCursor || state.loadingMore) return;
    const controller = new AbortController();

    setState((prev) =>
      prev.status === "ready" ? { ...prev, loadingMore: true } : prev,
    );

    listAdminUsers(
      {
        queryParams: {
          query: state.query || undefined,
          limit: 30,
          cursor: state.nextCursor,
        },
      },
      controller.signal,
    )
      .then((page) => {
        setState((prev) => {
          if (prev.status !== "ready") return prev;
          return {
            ...prev,
            users: [...prev.users, ...page.items],
            nextCursor: page.next_cursor,
            loadingMore: false,
          };
        });
      })
      .catch((err) => {
        console.error("Failed to load more users", err);
        const status = getHttpStatus(err);
        if (status === 401) {
          handleUnauthenticated();
          return;
        }
        setState((prev) =>
          prev.status === "ready" ? { ...prev, loadingMore: false } : prev,
        );
      });

    return () => controller.abort();
  }, [handleUnauthenticated, state]);

  useEffect(() => {
    if (state.status !== "ready") return;
    if (!state.nextCursor) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (state.status !== "ready") return;
        if (!state.nextCursor || state.loadingMore) return;
        loadMore();
      },
      { root: null, rootMargin: "250px 0px", threshold: 0.01 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, state]);

  const toggleConfirmed = useCallback(async (user: User) => {
    if (state.status !== "ready") return;
    const id = user.id ?? "";
    if (!id) return;

    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, updating: { ...prev.updating, [id]: true } }
        : prev,
    );

    try {
      await updateAdminUser({
        pathParams: { id },
        body: { confirmed: !user.confirmed },
      });
      const page = await listAdminUsers({
        queryParams: { query: state.query || undefined, limit: 30 },
      });
      setState({
        status: "ready",
        users: page.items,
        updating: {},
        nextCursor: page.next_cursor,
        query: state.query,
        loadingMore: false,
      });
    } catch (err) {
      console.error("Failed to update user", err);
      const status = getHttpStatus(err);
      if (status === 401) {
        handleUnauthenticated();
        return;
      }
      if (status === 403) {
        handleUnauthorized();
        return;
      }
      alert("Не удалось обновить пользователя.");
      setState((prev) =>
        prev.status === "ready"
          ? { ...prev, updating: { ...prev.updating, [id]: false } }
          : prev,
      );
    }
  }, [handleUnauthenticated, handleUnauthorized, state]);

  if (state.status === "error") {
    return (
      <ErrorState
        title={state.serverError ? "Сервис недоступен" : "Ошибка"}
        message={state.message}
        onAction={load}
      />
    );
  }

  if (meState.state.status !== "ready") {
    return <p className="text-sm text-(--muted)">Загрузка…</p>;
  }

  if (!meState.state.me.is_admin) {
    return (
      <div className="rounded-2xl border border-(--border) bg-(--panel) px-4 py-5 text-sm text-(--muted)">
        Нет доступа к админ панели.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.status === "loading" ? (
        <p className="text-sm text-(--muted)">Загрузка…</p>
      ) : (
        <>
          {state.status === "ready" ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex-1">
                <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Поиск
                </label>
                <input
                  value={state.query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="username или email"
                  className="mt-3 w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent)"
                />
              </div>
              <button
                className="rounded-xl bg-(--accent) px-5 py-3 text-sm font-medium text-black transition hover:bg-(--accent-2)"
                onClick={applyQuery}
              >
                Найти
              </button>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-(--border) bg-(--panel)">
            <div className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr] gap-3 border-b border-(--border) px-5 py-3 text-xs uppercase tracking-[0.2em] text-(--subtle)">
              <div>Email</div>
              <div>Username</div>
              <div>Confirmed</div>
              <div>Admin</div>
            </div>
            <div className="divide-y divide-(--border)">
              {state.status === "ready"
                ? state.users.map((user) => {
                  const id = user.id ?? "";
                  const busy =
                    state.status === "ready"
                      ? state.updating[id] === true
                      : false;

                  return (
                    <div
                      key={id || user.email}
                      className="grid grid-cols-[1.2fr_0.9fr_0.7fr_0.7fr] gap-3 px-5 py-4 text-sm"
                    >
                      <div className="truncate">{user.email}</div>
                      <div className="truncate text-(--muted)">
                        {user.username}
                      </div>
                      <div>
                        <button
                          className={`rounded-lg border px-3 py-1 text-xs transition ${
                            user.confirmed
                              ? "border-(--accent) text-(--accent)"
                              : "border-(--border) text-(--muted) hover:text-(--accent)"
                          }`}
                          disabled={busy || user.is_admin}
                          onClick={() => toggleConfirmed(user)}
                          title={
                            user.is_admin
                              ? "Админы подтверждаются автоматически"
                              : ""
                          }
                        >
                          {busy ? "…" : user.confirmed ? "да" : "нет"}
                        </button>
                      </div>
                      <div className="text-xs text-(--muted)">
                        {user.is_admin ? "да" : "нет"}
                      </div>
                    </div>
                  );
                })
                : null}
            </div>
          </div>

          {state.status === "ready" && state.nextCursor ? (
            <div className="flex justify-center">
              <button
                className="rounded-xl border border-(--border) px-4 py-2 text-sm text-(--muted) transition hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                onClick={loadMore}
                disabled={state.loadingMore}
              >
                {state.loadingMore ? "Загрузка…" : "Показать ещё"}
              </button>
            </div>
          ) : null}

          {state.status === "ready" && state.nextCursor ? (
            <div ref={loadMoreSentinelRef} className="h-1 w-full" />
          ) : null}
        </>
      )}
    </div>
  );
}
