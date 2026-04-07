"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute right-2 top-2 rounded-md bg-zinc-700 px-2 py-1 text-xs text-zinc-300 opacity-0 transition-all hover:bg-zinc-600 group-hover:opacity-100"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
