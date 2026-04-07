"use client";

import { useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-media-query";
import { BottomSheet } from "./bottom-sheet";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  isPending = false,
}: ConfirmDialogProps) {
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape key closes dialog
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  // Focus trap for desktop modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Auto-focus cancel button when dialog opens (desktop)
  useEffect(() => {
    if (open && !isMobile) {
      // Small delay to ensure the dialog is rendered
      requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
    }
  }, [open, isMobile]);

  if (!open) return null;

  const content = (
    <div className="flex flex-col gap-4">
      {/* Only show title/description in desktop; BottomSheet handles title on mobile */}
      {!isMobile && (
        <>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </>
      )}
      {isMobile && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      <div className="flex flex-row items-center justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          autoFocus
          className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm
            dark:border-zinc-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${
            destructive
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          }`}
        >
          {isPending ? "..." : confirmLabel}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onCancel} title={title}>
        {content}
      </BottomSheet>
    );
  }

  // Desktop: centered modal with backdrop
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6
          shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      >
        {content}
      </div>
    </div>
  );
}
