"use client";

import { useState, useRef, useCallback, useId, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}

const positionClasses: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const arrowClasses: Record<string, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-zinc-900 dark:border-t-zinc-100 border-x-transparent border-b-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-zinc-900 dark:border-b-zinc-100 border-x-transparent border-t-transparent",
  left: "left-full top-1/2 -translate-y-1/2 border-l-zinc-900 dark:border-l-zinc-100 border-y-transparent border-r-transparent",
  right: "right-full top-1/2 -translate-y-1/2 border-r-zinc-900 dark:border-r-zinc-100 border-y-transparent border-l-transparent",
};

const SHOW_DELAY = 500;
const MOBILE_HIDE_DELAY = 2000;

export function Tooltip({ content, children, side = "bottom", shortcut }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearAllTimeouts = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (touchTimeout.current) clearTimeout(touchTimeout.current);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hoverTimeout.current = null;
    touchTimeout.current = null;
    hideTimeout.current = null;
  }, []);

  const show = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = null;
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    clearAllTimeouts();
    setVisible(false);
  }, [clearAllTimeouts]);

  // Desktop hover handlers
  const handleMouseEnter = useCallback(() => {
    hoverTimeout.current = setTimeout(show, SHOW_DELAY);
  }, [show]);

  const handleMouseLeave = useCallback(() => {
    hide();
  }, [hide]);

  // Mobile long-press handlers
  const handleTouchStart = useCallback(() => {
    touchTimeout.current = setTimeout(() => {
      show();
      hideTimeout.current = setTimeout(() => setVisible(false), MOBILE_HIDE_DELAY);
    }, SHOW_DELAY);
  }, [show]);

  const handleTouchEnd = useCallback(() => {
    if (touchTimeout.current) {
      clearTimeout(touchTimeout.current);
      touchTimeout.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (touchTimeout.current) {
      clearTimeout(touchTimeout.current);
      touchTimeout.current = null;
    }
  }, []);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}

      <div
        id={tooltipId}
        role="tooltip"
        className={`absolute z-50 pointer-events-none whitespace-nowrap transition-opacity duration-150 ${
          positionClasses[side]
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {/* Tooltip body */}
        <div className="flex items-center rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-100 shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          <span>{content}</span>
          {shortcut && (
            <span className="ml-2 rounded bg-zinc-700 px-1 py-0.5 text-[10px] font-mono dark:bg-zinc-300">
              {shortcut}
            </span>
          )}
        </div>

        {/* Arrow */}
        <div
          className={`absolute border-4 ${arrowClasses[side]}`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
