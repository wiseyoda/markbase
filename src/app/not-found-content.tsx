"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const FRAGMENTS = [
  { text: "# Heading", x: -320, y: -220, speed: 0.7, size: "text-lg" },
  { text: "**bold text**", x: 280, y: -180, speed: 0.5, size: "text-base" },
  { text: "[broken link](./???)", x: -240, y: 160, speed: 0.9, size: "text-sm" },
  { text: "- [ ] find this page", x: 200, y: 200, speed: 0.6, size: "text-sm" },
  { text: "> file not found", x: -380, y: 40, speed: 0.4, size: "text-base" },
  { text: "```\nundefined\n```", x: 340, y: -40, speed: 0.8, size: "text-xs" },
  { text: "---", x: -160, y: -140, speed: 0.3, size: "text-2xl" },
  { text: "~~this page~~", x: 160, y: 120, speed: 0.55, size: "text-base" },
  { text: "![image](404.png)", x: -280, y: 240, speed: 0.45, size: "text-xs" },
  { text: "| col | col |", x: 360, y: -260, speed: 0.65, size: "text-xs" },
  { text: "* list item", x: -100, y: 280, speed: 0.35, size: "text-sm" },
  { text: "## Subheading", x: 100, y: -300, speed: 0.75, size: "text-sm" },
];

const MESSAGES = [
  "We checked every branch. Even main.",
  "The file tree came up empty.",
  "Perhaps it was soft-deleted.",
  "Have you tried Cmd+K?",
  "This isn't the markdown you're looking for.",
  "git blame won't help you here.",
  "README.md exists, but this page doesn't.",
  "404: File not found in any known repo.",
];

export function NotFoundContent() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMessageIndex((i) => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      {/* Floating markdown fragments */}
      {mounted &&
        FRAGMENTS.map((frag, i) => (
          <span
            key={i}
            className={`pointer-events-none absolute select-none font-mono ${frag.size} whitespace-pre`}
            style={{
              left: `calc(50% + ${frag.x}px)`,
              top: `calc(50% + ${frag.y}px)`,
              color: "rgba(134, 213, 244, 0.12)",
              animation: `notfound-drift ${12 + i * 2}s ease-in-out infinite alternate`,
              animationDelay: `${i * -1.5}s`,
            }}
          >
            {frag.text}
          </span>
        ))}

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center px-6">
        {/* The "broken" heading — raw markdown visible */}
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-2xl font-light"
            style={{ color: "rgba(134, 213, 244, 0.25)" }}
          >
            #
          </span>
          <span
            className="text-[8rem] font-bold leading-none tracking-tighter sm:text-[10rem]"
            style={{
              background:
                "linear-gradient(180deg, rgba(134,213,244,0.2) 0%, rgba(134,213,244,0.06) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            404
          </span>
        </div>

        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">
          Document not found
        </h1>

        {/* Rotating witty messages */}
        <p
          className="mt-3 h-6 text-center text-sm text-zinc-400 transition-opacity duration-300 dark:text-zinc-500"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {MESSAGES[messageIndex]}
        </p>

        {/* Blinking cursor — someone's about to type the fix */}
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600">
          <span className="text-zinc-300 dark:text-zinc-700">$</span>
          <span>git checkout -- this-page</span>
          <span className="notfound-cursor ml-0.5 inline-block h-4 w-[2px] bg-[#86D5F4]" />
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Go back
          </button>
        </div>
      </div>

      {/* Inline styles for animations (no external CSS needed) */}
      <style>{`
        @keyframes notfound-drift {
          0% { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(12px, -8px) rotate(1.5deg); }
        }
        .notfound-cursor {
          animation: notfound-blink 1s step-end infinite;
        }
        @keyframes notfound-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
