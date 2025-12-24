"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import CreateSpaceModal from "@/components/spaces/CreateSpaceModal";
import { useMe } from "@/lib/me";

type SpaceItem = {
  id: string;
  name: string;
};

type SpaceRailProps = {
  spaces: SpaceItem[];
  defaultExpanded?: boolean;
  isAdmin?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export default function SpaceRail({
  spaces,
  defaultExpanded = false,
  isAdmin,
  mobileOpen = false,
  onCloseMobile,
}: SpaceRailProps) {
  const [railExpanded, setRailExpanded] = useState(defaultExpanded);
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();
  const expanded = railExpanded || mobileOpen;
  const meState = useMe();
  const resolvedIsAdmin =
    typeof isAdmin === "boolean"
      ? isAdmin
      : meState.state.status === "ready"
        ? !!meState.state.me.is_admin
        : false;

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
        } lg:static lg:z-auto lg:flex ${
          expanded ? "lg:w-64 lg:px-4" : "lg:w-20 lg:items-center"
        }`}
      >
      <div
        className={`flex items-center gap-3 ${expanded ? "px-2" : "justify-center"}`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--panel) text-lg font-semibold">
          Z
        </div>
        {expanded && (
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Пространства
            </p>
            <p className="text-sm font-medium">Zerizeha</p>
          </div>
        )}
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
      {resolvedIsAdmin ? (
        <div className={`mt-4 ${expanded ? "px-2" : "flex justify-center"}`}>
          <Link
            href="/admin/users"
            className={`flex items-center gap-2 rounded-2xl border border-(--border) text-xs uppercase tracking-[0.2em] text-(--muted) transition hover:border-(--accent) hover:text-(--accent) ${
              expanded ? "px-4 py-2" : "h-10 w-10 justify-center"
            }`}
            title="Админ-панель"
            aria-label="Админ-панель"
          >
            <span className="text-sm">⚙</span>
            {expanded ? <span>Админ панель</span> : null}
          </Link>
        </div>
      ) : null}
      <div
        className={`mt-6 flex flex-1 flex-col gap-3 ${expanded ? "" : "items-center"}`}
      >
        {spaces.map((space) => {
          const href = `/spaces/${space.id}`;
          const isActive =
            pathname === href ||
            (pathname?.startsWith(`/spaces/${space.id}/`) ?? false);

            return (
              <Link
                key={space.id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-12 items-center gap-3 rounded-2xl text-sm font-semibold transition ${
                  isActive
                    ? "bg-(--accent) text-black"
                    : "bg-(--panel) text-(--muted) hover:text-(--accent)"
                } ${expanded ? "px-4" : "w-12 justify-center"}`}
              >
                <span className="text-base">
                  {space.name.slice(0, 1).toUpperCase()}
                </span>
                {expanded && <span className="truncate">{space.name}</span>}
              </Link>
            );
          })}
      </div>
      <div
        className={`flex w-full flex-col gap-2 ${expanded ? "px-2" : "items-center"}`}
      >
        <button
          className={`flex h-12 items-center gap-3 rounded-2xl border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent) ${
            expanded ? "px-4" : "w-12 justify-center"
          }`}
          onClick={() => setCreateOpen(true)}
        >
          +{expanded && <span>Создать</span>}
        </button>
        <button
          className={`flex h-10 items-center rounded-xl border border-(--border) text-(--muted) transition hover:text-(--accent) ${
            expanded ? "px-4" : "w-12 justify-center"
          }`}
          onClick={() => setRailExpanded((prev) => !prev)}
          aria-label={
            railExpanded
              ? "Свернуть список пространств"
              : "Развернуть список пространств"
          }
        >
          <svg
            className={`h-4 w-4 transition-transform ${
              railExpanded ? "rotate-180" : ""
            }`}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M6 3.5L10 8L6 12.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {expanded && <span className="ml-2 text-xs">Свернуть</span>}
        </button>
      </div>
      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      </aside>
    </>
  );
}
