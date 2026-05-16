import { useState } from "react";
import type { TranslationKey, Project } from "../types.ts";
import { MiniMessagePreview } from "./MiniMessagePreview.tsx";
import { MockArgEditor } from "./MockArgEditor.tsx";
import { useMockStore } from "../store.ts";

type Props = {
  translationKey: TranslationKey;
  project: Project;
  depth?: number;
};

const STATUS_COLORS = {
  pending: "text-yellow-400",
  approved: "text-green-400",
  rejected: "text-red-400",
} as const;

export function KeyRow({ translationKey: k, project, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { getMocks } = useMockStore();
  const mocks = getMocks(k.id);

  const status = k.translation?.status;
  const dotParts = k.key.split(".");
  // Show only the leaf part of the key to reduce noise
  const leafKey = dotParts[dotParts.length - 1];

  return (
    <div
      className="border-b border-white/5 hover:bg-white/2 transition-colors"
      style={{ paddingLeft: `${depth * 16}px` }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3"
      >
        <span className="text-white/30 text-xs w-4">{expanded ? "▼" : "▶"}</span>
        <span className="font-mono text-xs text-white/50 w-40 truncate" title={k.key}>
          {k.key}
        </span>
        <span className="flex-1 text-sm text-white/80 truncate">{k.sourceValue}</span>
        {status && (
          <span className={`text-xs ${STATUS_COLORS[status]}`}>{status}</span>
        )}
        {k.detectedArgs.length > 0 && (
          <span className="text-xs text-amber-400/60">
            {k.detectedArgs.length} arg{k.detectedArgs.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          <div>
            <div className="text-xs text-white/40 mb-1">Source</div>
            <MiniMessagePreview
              value={k.sourceValue}
              themeColors={project.themeColors}
              mockArgs={mocks}
            />
          </div>

          {k.detectedArgs.length > 0 && (
            <div>
              <div className="text-xs text-white/40 mb-1">Mock arguments</div>
              <MockArgEditor keyId={k.id} args={k.detectedArgs} />
            </div>
          )}

          {k.translation && (
            <div>
              <div className="text-xs text-white/40 mb-1">Translation</div>
              <MiniMessagePreview
                value={k.translation.value}
                themeColors={project.themeColors}
                mockArgs={mocks}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
