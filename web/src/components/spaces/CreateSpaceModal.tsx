"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";

type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function CreateSpaceModal({
  open,
  onClose,
}: CreateSpaceModalProps) {
  const [name, setName] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Создать пространство"
      description="Придумай название, чтобы команда сразу узнала пространство."
    >
      <div className="flex flex-col gap-4">
        <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
          Название пространства
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Например: Studio, Team, Alpha"
          className="w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent)"
        />
        <div className="flex items-center justify-between pt-2">
          <button
            className="text-sm text-(--muted) transition hover:text-(--accent)"
            onClick={onClose}
          >
            Отменить
          </button>
          <button className="rounded-xl bg-(--accent) px-5 py-2 text-sm font-medium text-black transition hover:bg-(--accent-2)">
            Создать
          </button>
        </div>
      </div>
    </Modal>
  );
}
