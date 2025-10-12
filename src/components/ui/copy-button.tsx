"use client";

import { useState } from "react";

export function CopyButton({ text, children }: { text: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="rounded-md border px-3 py-2 text-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Скопировано" : children ?? "Копировать"}
    </button>
  );
}


