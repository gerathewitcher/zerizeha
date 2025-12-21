"use client";

import Modal from "@/components/ui/Modal";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отменить",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="flex items-center justify-between pt-4">
        <button
          className="text-sm text-(--muted) transition hover:text-(--accent)"
          onClick={onClose}
        >
          {cancelLabel}
        </button>
        <button
          className="rounded-xl bg-(--danger) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
