"use client";

import { useRef, useEffect } from "react";

export function SelectionPopup({
  x,
  y,
  onComment,
  onClose,
}: {
  x: number;
  y: number;
  onComment: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Delay to avoid capturing the mouseup that created this
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handler),
      100,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] rounded-md border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: x - 40, top: y }}
    >
      <button
        onClick={onComment}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z" />
        </svg>
        Comment
      </button>
    </div>
  );
}
