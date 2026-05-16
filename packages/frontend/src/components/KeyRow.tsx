import type { TranslationKey } from "../types.ts";

type Props = {
  translationKey: TranslationKey;
  isSelected: boolean;
  compact: boolean;
  onClick: () => void;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function KeyRow({ translationKey: k, isSelected, compact, onClick }: Props) {
  const status = k.translation?.status ?? "untranslated";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-white/5 transition-colors ${
        isSelected
          ? "bg-blue-600/15 border-l-2 border-l-blue-500"
          : "hover:bg-white/3 border-l-2 border-l-transparent"
      }`}
    >
      <span
        className={`font-mono text-xs text-white/40 truncate ${compact ? "flex-1 min-w-0" : "shrink-0 w-48"}`}
        title={k.key}
      >
        {k.key}
      </span>

      {!compact && (
        <span className="flex-1 text-sm text-white/65 truncate">
          {k.sourceValue}
        </span>
      )}

      {k.detectedArgs.length > 0 && (
        <span className="text-xs text-amber-400/40 shrink-0">
          {k.detectedArgs.length}arg{k.detectedArgs.length !== 1 ? "s" : ""}
        </span>
      )}

      <span
        className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${
          STATUS_BADGE[status] ?? "bg-white/5 text-white/25 border-white/10"
        }`}
      >
        {status}
      </span>
    </button>
  );
}
