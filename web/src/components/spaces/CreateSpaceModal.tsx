"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { createSpaceByName } from "@/lib/api/spaces";
import { getHttpStatus } from "@/lib/api/errors";
import { redirectIfAuthOrOnboardingError } from "@/lib/api/redirects";

type CreateSpaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function CreateSpaceModal({
  open,
  onClose,
}: CreateSpaceModalProps) {
  const router = useRouter();
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

    const controller = new AbortController();
    setSubmitting(true);
    setError(null);

    try {
      const spaceId = await createSpaceByName(value, controller.signal);
      onClose();
      router.push(`/spaces/${spaceId}`);
    } catch (err) {
      console.error("Failed to create space", err);
      if (redirectIfAuthOrOnboardingError(err)) return;
      const status = getHttpStatus(err);
      setError(
        status === 400
          ? "Проверь название и попробуй ещё раз."
          : "Не удалось создать пространство. Попробуй ещё раз.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Создать"
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
