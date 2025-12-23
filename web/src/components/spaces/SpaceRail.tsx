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
};

export default function SpaceRail({
  spaces,
  defaultExpanded = false,
  isAdmin,
}: SpaceRailProps) {
  const [railExpanded, setRailExpanded] = useState(defaultExpanded);
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();
  const meState = useMe();
  const resolvedIsAdmin =
    typeof isAdmin === "boolean"
      ? isAdmin
      : meState.state.status === "ready"
        ? !!meState.state.me.is_admin
        : false;

  return (
    <aside
      className={`hidden h-full flex-col border-r border-(--border) bg-(--bg-2) py-6 transition-all lg:flex ${
        railExpanded ? "w-64 px-4" : "w-20 items-center"
      }`}
    >
      <div
        className={`flex items-center gap-3 ${
          railExpanded ? "px-2" : "justify-center"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-(--panel) text-lg font-semibold">
          Z
        </div>
        {railExpanded && (
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Пространства
            </p>
            <p className="text-sm font-medium">Zerizeha</p>
          </div>
        )}
      </div>
      {resolvedIsAdmin ? (
        <div className={`mt-4 ${railExpanded ? "px-2" : "flex justify-center"}`}>
          <Link
            href="/admin/users"
            className={`flex items-center gap-2 rounded-2xl border border-(--border) text-xs uppercase tracking-[0.2em] text-(--muted) transition hover:border-(--accent) hover:text-(--accent) ${
              railExpanded ? "px-4 py-2" : "h-10 w-10 justify-center"
            }`}
            title="Админ-панель"
            aria-label="Админ-панель"
          >
            <span className="text-sm">⚙</span>
            {railExpanded ? <span>Админ панель</span> : null}
          </Link>
        </div>
      ) : null}
      <div
        className={`mt-6 flex flex-1 flex-col gap-3 ${
          railExpanded ? "" : "items-center"
        }`}
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
              } ${railExpanded ? "px-4" : "w-12 justify-center"}`}
            >
              <span className="text-base">
                {space.name.slice(0, 1).toUpperCase()}
              </span>
              {railExpanded && <span className="truncate">{space.name}</span>}
            </Link>
          );
        })}
      </div>
      <div
        className={`flex w-full flex-col gap-2 ${
          railExpanded ? "px-2" : "items-center"
        }`}
      >
        <button
          className={`flex h-12 items-center gap-3 rounded-2xl border border-(--border) text-(--muted) transition hover:border-(--accent) hover:text-(--accent) ${
            railExpanded ? "px-4" : "w-12 justify-center"
          }`}
          onClick={() => setCreateOpen(true)}
        >
          +{railExpanded && <span>Создать</span>}
        </button>
        <button
          className={`flex h-10 items-center rounded-xl border border-(--border) text-(--muted) transition hover:text-(--accent) ${
            railExpanded ? "px-4" : "w-12 justify-center"
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
          {railExpanded && <span className="ml-2 text-xs">Свернуть</span>}
        </button>
      </div>
      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </aside>
  );
}
