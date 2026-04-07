"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  state: "entering" | "visible" | "exiting";
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 3000;
const EXIT_ANIMATION_MS = 300;

function SuccessIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d="M11.5 3.5L5.5 10L2.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d="M10 4L4 10M4 4L10 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 6.5V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7" cy="4.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

const iconMap: Record<ToastType, () => ReactNode> = {
  success: SuccessIcon,
  error: ErrorIcon,
  info: InfoIcon,
};

const accentColorMap: Record<ToastType, string> = {
  success: "border-l-green-500",
  error: "border-l-red-500",
  info: "border-l-blue-500",
};

const iconColorMap: Record<ToastType, string> = {
  success: "text-green-500",
  error: "text-red-500",
  info: "text-blue-500",
};

function ToastItem({
  toast,
  onDismiss,
  onRemove,
}: {
  toast: Toast;
  onDismiss: () => void;
  onRemove: () => void;
}) {
  const Icon = iconMap[toast.type];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.state === "visible") {
      timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.state, onDismiss]);

  const isVisible = toast.state === "visible";
  const isExiting = toast.state === "exiting";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "rounded-lg shadow-lg px-4 py-3 text-sm font-medium",
        "bg-white dark:bg-zinc-900",
        "border border-zinc-200 dark:border-zinc-800",
        "border-l-4",
        accentColorMap[toast.type],
        "flex items-center gap-2",
        "transition-all duration-300 ease-in-out",
        // Desktop: slide from right
        isVisible
          ? "sm:translate-x-0 sm:opacity-100"
          : "sm:translate-x-full sm:opacity-0",
        // Mobile: slide from bottom
        isVisible
          ? "max-sm:translate-y-0 max-sm:opacity-100"
          : "max-sm:translate-y-4 max-sm:opacity-0",
        // Exiting states
        isExiting ? "sm:translate-x-full sm:opacity-0" : "",
        isExiting ? "max-sm:translate-y-4 max-sm:opacity-0" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={iconColorMap[toast.type]}>
        <Icon />
      </span>
      <span className="text-zinc-900 dark:text-zinc-100">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onRemove();
          }}
          className="ml-2 shrink-0 text-xs font-semibold underline hover:no-underline"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, state: "exiting" as const } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info", action?: ToastAction) => {
      const id = crypto.randomUUID();
      const newToast: Toast = { id, message, type, action, state: "entering" };

      setToasts((prev) => {
        const next = [...prev, newToast];
        // Evict oldest beyond max
        while (next.filter((t) => t.state !== "exiting").length > MAX_TOASTS) {
          const oldest = next.find((t) => t.state !== "exiting");
          if (oldest) oldest.state = "exiting";
        }
        return next;
      });

      // Transition from entering to visible on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setToasts((prev) =>
            prev.map((t) => (t.id === id && t.state === "entering" ? { ...t, state: "visible" } : t)),
          );
        });
      });

      // Clean up evicted toasts after their exit animation
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.state !== "exiting" || t.id === id));
      }, EXIT_ANIMATION_MS);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-label="Notifications"
        className={[
          "fixed z-[100] flex flex-col gap-2 pointer-events-none",
          // Mobile: bottom center
          "bottom-4 left-1/2 -translate-x-1/2",
          // Desktop: bottom right
          "sm:left-auto sm:right-4 sm:translate-x-0",
        ].join(" ")}
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem
              toast={t}
              onDismiss={() => removeToast(t.id)}
              onRemove={() => removeToast(t.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
