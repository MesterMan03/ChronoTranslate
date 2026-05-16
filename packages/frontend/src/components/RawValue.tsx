import { useState } from "react";

type Props = {
  value: string;
};

export function RawValue({ value }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-start gap-2 mt-1.5">
      <code className="flex-1 text-xs font-mono text-white/40 bg-white/3 rounded px-2 py-1 break-all leading-relaxed">
        {value}
      </code>
      <button
        onClick={copy}
        className="shrink-0 text-xs text-white/25 hover:text-white/60 px-1.5 py-1 rounded transition-colors"
        title="Copy raw value"
      >
        {copied ? "✓" : "⎘"}
      </button>
    </div>
  );
}
