"use client";

import { useEffect, useState } from "react";

const files = [
  { name: "README.md", active: false },
  { name: "strategic-plan.md", active: true },
  { name: "roadmap.md", active: false },
  { name: "meeting-notes/", active: false },
  { name: "architecture.md", active: false },
];

export function ProductDemo() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setActive(true));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setActive(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const d = (ms: number): React.CSSProperties => ({
    transitionDelay: active ? `${ms}ms` : "0ms",
  });

  const fade = `transition-all duration-500 ease-out ${
    active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
  }`;

  const slideRight = `transition-all duration-500 ease-out ${
    active ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
  }`;

  return (
    <div
      className={`transition-all duration-700 ease-out ${
        active ? "opacity-100 scale-100" : "opacity-0 scale-[0.97]"
      }`}
    >
      <div className="overflow-hidden rounded-2xl border border-zinc-300/80 bg-white dark:border-zinc-700/80 dark:bg-zinc-950">
        <div className="flex min-h-[340px]">
          {/* File sidebar */}
          <div className="hidden w-44 shrink-0 border-r border-zinc-100 p-5 sm:block dark:border-zinc-800/50">
            <nav className="flex flex-col gap-2 text-[13px]">
              {files.map((file, i) => (
                <span
                  key={file.name}
                  className={`${fade} ${
                    file.active
                      ? "rounded-md bg-[#86D5F4]/10 px-2 py-1 font-medium text-[#4ab3de] dark:text-[#86D5F4]"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                  style={d(200 + i * 80)}
                >
                  {file.name}
                </span>
              ))}
            </nav>
          </div>

          {/* Content area */}
          <div className="flex-1 p-6 sm:p-8">
            <h3
              className={`${fade} text-lg font-semibold text-sky-900 dark:text-[#86D5F4]`}
              style={d(500)}
            >
              Strategic Plan 2026
            </h3>

            <div className={`${fade} mt-4 space-y-2`} style={d(650)}>
              <div className="h-2.5 w-[85%] rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
              <div className="h-2.5 w-[65%] rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
              <div className="h-2.5 w-[72%] rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
            </div>

            <div
              className={`${fade} mt-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900/50`}
              style={d(850)}
            >
              <div className="space-y-1.5 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                <span className="block">
                  <span className="text-sky-500 dark:text-[#86D5F4]">const</span> targets =
                  getQ3Goals();
                </span>
                <span className="block">
                  <span className="text-sky-500 dark:text-[#86D5F4]">await</span>{" "}
                  syncReport(targets);
                </span>
                <span className="block">
                  <span className="inline-block h-3.5 w-px animate-blink bg-zinc-400 dark:bg-zinc-500" />
                </span>
              </div>
            </div>
          </div>

          {/* Comment panel — desktop */}
          <div className="hidden w-52 shrink-0 border-l border-zinc-100 p-4 md:block dark:border-zinc-800/50">
            <div
              className={`${slideRight} rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/50`}
              style={d(1200)}
            >
              <CommentContent />
            </div>
          </div>
        </div>

        {/* Mobile: comment below content */}
        <div
          className={`${fade} border-t border-zinc-100 p-4 md:hidden dark:border-zinc-800/50`}
          style={d(1000)}
        >
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/50">
            <CommentContent />
          </div>
        </div>

        {/* Mobile: file chips */}
        <div
          className={`${fade} flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-3 sm:hidden dark:border-zinc-800/50`}
          style={d(1100)}
        >
          {files.slice(0, 3).map((file) => (
            <span
              key={file.name}
              className={`rounded px-2 py-0.5 text-[11px] ${
                file.active
                  ? "bg-[#86D5F4]/10 font-medium text-[#4ab3de] dark:text-[#86D5F4]"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {file.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentContent() {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#86D5F4]/20 text-[10px] font-bold text-[#86D5F4]">
          P
        </span>
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Patrick
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Great analysis on the growth projections. Let&apos;s revisit the
        timeline in our next sync.
      </p>
    </>
  );
}
