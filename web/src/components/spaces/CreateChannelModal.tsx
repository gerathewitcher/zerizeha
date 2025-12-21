"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";

type ChannelType = "text" | "voice";

type CreateChannelModalProps = {
  open: boolean;
  onClose: () => void;
  channelType: ChannelType;
};

export default function CreateChannelModal({
  open,
  onClose,
  channelType,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Создать канал"
      description="Задай короткое название для канала."
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-(--subtle)">
          Тип канала
          <span className="rounded-full border border-(--border) px-2 py-1 text-[10px] text-(--muted)">
            {channelType === "text" ? "текстовый" : "голосовой"}
          </span>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
            Название канала
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              channelType === "text" ? "например: общий" : "например: Комната"
            }
            className="mt-3 w-full rounded-xl border border-(--border) bg-(--bg-2) px-4 py-3 text-sm text-(--text) outline-none transition focus:border-(--accent)"
          />
        </div>

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
