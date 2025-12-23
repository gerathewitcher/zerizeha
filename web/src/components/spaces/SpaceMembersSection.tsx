"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import ErrorState from "@/components/ui/ErrorState";
import { createSpaceMember } from "@/lib/api/generated/zerizeha-components";
import {
  listSpaceMembers,
  removeSpaceMember,
  searchUsers,
} from "@/lib/api/generated/zerizeha-components";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";
import { getHttpStatus } from "@/lib/api/errors";
import type {
  SpaceMemberView,
  UserSearchResult,
} from "@/lib/api/generated/zerizeha-schemas";

type SpaceMembersSectionProps = {
  spaceId: string;
  canManage: boolean;
};

export default function SpaceMembersSection({
  spaceId,
  canManage,
}: SpaceMembersSectionProps) {
  const [search, setSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<SpaceMemberView | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [members, setMembers] = useState<SpaceMemberView[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [userNextCursor, setUserNextCursor] = useState<string | undefined>(
    undefined,
  );
  const [userSearchStatus, setUserSearchStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [userLoadingMore, setUserLoadingMore] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [userLoadMoreSentinel, setUserLoadMoreSentinel] =
    useState<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return members;
    }
    return members.filter((member) =>
      member.username.toLowerCase().includes(query) ||
      (member.email ?? "").toLowerCase().includes(query),
    );
  }, [members, search]);

  const memberUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const member of members) set.add(member.user_id);
    return set;
  }, [members]);

  const loadMembers = useCallback(() => {
    if (!canManage || !spaceId) return;
    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage("");

    listSpaceMembers({ pathParams: { id: spaceId } }, controller.signal)
      .then((data) => {
        setMembers(data);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("Failed to load space members", err);
        if (redirectIfAuthOrOnboardingError(err)) return;
        const status = getHttpStatus(err);
        setStatus("error");
        setErrorMessage(
          typeof status === "number" && status >= 500
            ? "Сервер временно недоступен. Попробуйте повторить позже."
            : "Не удалось загрузить участников пространства.",
        );
      });

    return () => controller.abort();
  }, [canManage, spaceId]);

  useEffect(() => loadMembers(), [loadMembers]);

  useEffect(() => {
    if (!canManage) return;
    const query = userQuery.trim();
    if (!query) {
      setUserResults([]);
      setUserNextCursor(undefined);
      setUserLoadingMore(false);
      setUserSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setUserSearchStatus("loading");
      searchUsers({ queryParams: { query, limit: 10 } }, controller.signal)
        .then((page) => {
          setUserResults(page.items);
          setUserNextCursor(page.next_cursor);
          setUserLoadingMore(false);
          setUserSearchStatus("ready");
        })
        .catch((err) => {
          console.error("User search failed", err);
          if (redirectIfAuthOrOnboardingError(err)) return;
          setUserLoadingMore(false);
          setUserSearchStatus("error");
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canManage, userQuery]);

  useEffect(() => {
    if (!canManage) return;
    if (!userLoadMoreSentinel) return;
    if (!userQuery.trim()) return;
    if (!userNextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (userLoadingMore) return;
        if (!userNextCursor) return;

        const query = userQuery.trim();
        if (!query) return;

        const controller = new AbortController();
        setUserLoadingMore(true);
        searchUsers(
          { queryParams: { query, limit: 10, cursor: userNextCursor } },
          controller.signal,
        )
          .then((page) => {
            setUserResults((prev) => {
              const seen = new Set(prev.map((u) => u.id));
              const merged = [...prev];
              for (const user of page.items) {
                if (seen.has(user.id)) continue;
                seen.add(user.id);
                merged.push(user);
              }
              return merged;
            });
            setUserNextCursor(page.next_cursor);
            setUserLoadingMore(false);
          })
          .catch((err) => {
            console.error("User search load more failed", err);
            if (redirectIfAuthOrOnboardingError(err)) return;
            setUserLoadingMore(false);
          });
      },
      { root: null, rootMargin: "200px 0px", threshold: 0.01 },
    );

    observer.observe(userLoadMoreSentinel);
    return () => observer.disconnect();
  }, [canManage, userLoadMoreSentinel, userLoadingMore, userNextCursor, userQuery]);

  const addUserToSpace = useCallback(
    async (user: UserSearchResult) => {
      if (!spaceId) return;
      if (busyUserId) return;
      if (memberUserIds.has(user.id)) return;
      setBusyUserId(user.id);
      try {
        await createSpaceMember({ body: { space_id: spaceId, user_id: user.id } });
        await loadMembers();
      } catch (err) {
        console.error("Failed to add user to space", err);
        redirectIfAuthOrOnboardingError(err);
      } finally {
        setBusyUserId(null);
      }
    },
    [busyUserId, loadMembers, memberUserIds, spaceId],
  );

  const removeUserFromSpace = useCallback(
    async (member: SpaceMemberView) => {
      if (!spaceId) return;
      if (busyUserId) return;
      setBusyUserId(member.user_id);
      try {
        await removeSpaceMember({
          pathParams: { spaceId, userId: member.user_id },
        });
        setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      } catch (err) {
        console.error("Failed to remove user from space", err);
        redirectIfAuthOrOnboardingError(err);
      } finally {
        setBusyUserId(null);
      }
    },
    [busyUserId, spaceId],
  );

  if (!canManage) {
    return (
      <section>
        <h2 className="text-lg font-semibold">Участники</h2>
        <p className="mt-2 text-sm text-(--muted)">
          Управлять участниками может только создатель пространства.
        </p>
      </section>
    );
  }

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold">Участники</h2>
        <p className="mt-2 text-sm text-(--muted)">
          Найди участника и управляй доступом к пространству.
        </p>
        <div className="mt-6 rounded-2xl border border-(--border) bg-(--panel) p-6">
          {status === "error" ? (
            <ErrorState title="Ошибка" message={errorMessage} onAction={loadMembers} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                  Добавить участника
                </label>
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Найти по email или имени"
                  className="w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent) md:w-64"
                />
              </div>
              {userQuery.trim() ? (
                <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
                  {userSearchStatus === "loading" ? (
                    <p className="text-sm text-(--muted)">Поиск…</p>
                  ) : userSearchStatus === "error" ? (
                    <p className="text-sm text-(--subtle)">
                      Не удалось выполнить поиск.
                    </p>
                  ) : userResults.length ? (
                    <>
                      {userResults.map((user) => {
                        const alreadyMember = memberUserIds.has(user.id);
                        const disabled =
                          alreadyMember || busyUserId === user.id;
                        return (
                          <div
                            key={user.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {user.username}
                              </p>
                              <p className="truncate text-xs text-(--subtle)">
                                {user.email ?? user.id}
                              </p>
                            </div>
                            <button
                              className="rounded-lg border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:border-(--accent) hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={disabled}
                              onClick={() => addUserToSpace(user)}
                            >
                              {alreadyMember ? "Уже в пространстве" : "Добавить"}
                            </button>
                          </div>
                        );
                      })}
                      {userLoadingMore ? (
                        <p className="text-sm text-(--muted)">Загрузка…</p>
                      ) : null}
                      {userNextCursor ? (
                        <div
                          ref={setUserLoadMoreSentinel}
                          className="h-1 w-full"
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-(--subtle)">Ничего не найдено.</p>
                  )}
                </div>
              ) : null}

              <div className="mt-8 border-t border-(--border) pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
                    Поиск по участникам
                  </label>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Введите имя"
                    className="w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent) md:w-64"
                  />
                </div>
                <div className="mt-6 space-y-3">
                  {status === "loading" ? (
                    <p className="text-sm text-(--muted)">Загрузка…</p>
                  ) : (
                    <>
                      {filtered.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--bg-2) text-sm font-semibold">
                              {member.username.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {member.username}
                              </p>
                              <p className="truncate text-xs text-(--subtle)">
                                {member.is_admin ? "Администратор" : member.email ?? "Участник"}
                              </p>
                            </div>
                          </div>
                          <button
                            className="rounded-lg border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:border-(--danger) hover:text-(--danger) disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => setRemoveTarget(member)}
                            disabled={busyUserId === member.user_id}
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                      {!filtered.length && (
                        <p className="text-sm text-(--subtle)">Ничего не найдено.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <ConfirmModal
        open={!!removeTarget}
        title="Удалить участника?"
        description={
          removeTarget
            ? `Участник ${removeTarget.username} будет удален из пространства.`
            : "Участник будет удален из пространства."
        }
        confirmLabel="Удалить"
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          const target = removeTarget;
          setRemoveTarget(null);
          if (target) {
            void removeUserFromSpace(target);
          }
        }}
      />
    </>
  );
}
