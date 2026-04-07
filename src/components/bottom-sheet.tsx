"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
}

const DISMISS_THRESHOLD = 100;
const TRANSITION_MS = 300;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(container.querySelectorAll<HTMLElement>(selectors));
}

// SSR-safe body reference
const noop = () => () => {};

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85vh",
}: BottomSheetProps) {
  // `phase` drives the entire lifecycle without calling setState in effects:
  //   "closed"  -> DOM not rendered
  //   "opening" -> DOM rendered, off-screen (pre-animation frame)
  //   "open"    -> DOM rendered, visible (animated in)
  //   "closing" -> DOM rendered, sliding out (exit animation playing)
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">(
    open ? "opening" : "closed",
  );
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const savedOverflow = useRef("");

  const body = useSyncExternalStore(
    noop,
    () => document.body,
    () => null,
  );

  // Respond to prop changes by moving to the appropriate transition phase.
  // We derive the next phase from (open, currentPhase) without calling
  // setState in an effect -- instead we compute it during render.
  if (open && (phase === "closed" || phase === "closing")) {
    setPhase("opening");
  } else if (!open && (phase === "open" || phase === "opening")) {
    setPhase("closing");
  }

  // "opening" -> "open": after one animation frame so the browser paints
  // the off-screen position first, enabling the CSS transition.
  useEffect(() => {
    if (phase !== "opening") return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setPhase("open");
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase]);

  // "closing" -> "closed": after the exit transition duration
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => {
      setPhase("closed");
      setDragY(0);
    }, TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      savedOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = savedOverflow.current;
    }
    return () => {
      document.body.style.overflow = savedOverflow.current;
    };
  }, [open]);

  // Focus trap and Escape key
  useEffect(() => {
    if (phase !== "open" || !sheetRef.current) return;

    const sheet = sheetRef.current;

    const focusFirst = () => {
      const focusable = getFocusableElements(sheet);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    };
    const focusTimer = setTimeout(focusFirst, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const focusable = getFocusableElements(sheet);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [phase, onClose]);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, delta));
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    }
    setDragY(0);
  }, [isDragging, dragY, onClose]);

  if (phase === "closed" || !body) return null;

  const isVisible = phase === "open";
  const sheetTranslate = isVisible ? dragY : window.innerHeight;
  const transitionStyle = isDragging
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={{
          opacity: isVisible ? 1 : 0,
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        style={{
          maxHeight,
          transform: `translateY(${sheetTranslate}px)`,
          transition: transitionStyle,
        }}
      >
        {/* Drag handle area */}
        <div
          className="flex cursor-grab items-center justify-center py-3 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        </div>

        {/* Title row */}
        {title && (
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 pb-3 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {title}
            </span>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Close"
            >
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div
          className="overflow-y-auto overscroll-contain px-4 pb-4 pt-2"
          style={{ maxHeight: `calc(${maxHeight} - 4rem)` }}
        >
          {children}
        </div>
      </div>
    </div>,
    body,
  );
}
