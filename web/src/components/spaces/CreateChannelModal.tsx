"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { createChannelInSpace } from "@/lib/api/channels";
import { getHttpStatus } from "@/lib/api/errors";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";

type ChannelType = "text" | "voice";

type CreateChannelModalProps = {
  open: boolean;
  onClose: () => void;
  channelType: ChannelType;
  spaceId: string;
  onCreated?: () => void;
};

export default function CreateChannelModal({
  open,
  onClose,
  channelType,
  spaceId,
  onCreated,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!open) {
      setName("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    const value = trimmedName;
    if (!value || submitting) return;
    if (!spaceId) {
      setError("Не удалось определить пространство.");
      return;
    }

    const controller = new AbortController();
    setSubmitting(true);
    setError(null);

    try {
      await createChannelInSpace(
        { space_id: spaceId, name: value, channel_type: channelType },
        controller.signal,
      );
      onClose();
      onCreated?.();
    } catch (err) {
      console.error("Failed to create channel", err);
      if (redirectIfAuthOrOnboardingError(err)) return;
      const status = getHttpStatus(err);
      setError(
        status === 400
          ? "Проверь название и попробуй ещё раз."
          : "Не удалось создать канал. Попробуй ещё раз.",
      );
    } finally {
      setSubmitting(false);
    }
  }

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

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex items-center justify-between pt-2">
          <button
            className="text-sm text-(--muted) transition hover:text-(--accent)"
            onClick={onClose}
            disabled={submitting}
          >
            Отменить
          </button>
          <button
            className="rounded-xl bg-(--accent) px-5 py-2 text-sm font-medium text-black transition hover:bg-(--accent-2) disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
            disabled={!trimmedName || submitting}
          >
            {submitting ? "Создаём…" : "Создать"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
