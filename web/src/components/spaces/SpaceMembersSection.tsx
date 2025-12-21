"use client";

import { useMemo, useState } from "react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import type { Member } from "@/lib/mock";

type SpaceMembersSectionProps = {
  members: Member[];
};

export default function SpaceMembersSection({
  members,
}: SpaceMembersSectionProps) {
  const [search, setSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return members;
    }
    return members.filter((member) =>
      member.name.toLowerCase().includes(query),
    );
  }, [members, search]);

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold">Участники</h2>
        <p className="mt-2 text-sm text-(--muted)">
          Найди участника и управляй доступом к пространству.
        </p>
        <div className="mt-6 rounded-2xl border border-(--border) bg-(--panel) p-6">
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
            {filtered.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--bg-2) text-sm font-semibold">
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-(--subtle)">
                      {member.role === "admin" ? "Администратор" : "Участник"}
                    </p>
                  </div>
                </div>
                <button
                  className="rounded-lg border border-(--border) px-3 py-2 text-xs text-(--muted) transition hover:border-(--danger) hover:text-(--danger)"
                  onClick={() => setRemoveTarget(member.name)}
                >
                  Удалить
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="text-sm text-(--subtle)">Ничего не найдено.</p>
            )}
          </div>
        </div>
      </section>

      <ConfirmModal
        open={!!removeTarget}
        title="Удалить участника?"
        description={
          removeTarget
            ? `Участник ${removeTarget} будет удален из пространства.`
            : "Участник будет удален из пространства."
        }
        confirmLabel="Удалить"
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => setRemoveTarget(null)}
      />
    </>
  );
}
