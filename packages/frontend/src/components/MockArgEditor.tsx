import type { CustomTag, DetectedArg } from "../types.ts";
import { useMockStore } from "../store.ts";

type Props = {
  keyId: string;
  args: DetectedArg[];
  customTags?: CustomTag[];
};

export function MockArgEditor({ keyId, args, customTags = [] }: Props) {
  const { setMock, getMocks, clearMocks } = useMockStore();
  const mocks = getMocks(keyId);

  const nonMockableNames = new Set(
    customTags.filter((t) => t.nonMockable).map((t) => t.name)
  );
  const mockableArgs = args.filter((a) => !nonMockableNames.has(a.name));

  if (mockableArgs.length === 0) return null;

  const hasAnyValue = mockableArgs.some((a) => mocks[a.name]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {mockableArgs.map((arg) => (
        <label key={arg.name} className="flex items-center gap-1.5 text-xs">
          <span className="text-amber-400 font-mono">
            {arg.style === "tag" ? `<${arg.name}>` : `{{${arg.name}}}`}
          </span>
          <input
            type="text"
            placeholder="mock value"
            value={mocks[arg.name] ?? ""}
            onChange={(e) => setMock(keyId, arg.name, e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:border-blue-500"
          />
        </label>
      ))}
      {hasAnyValue && (
        <button
          onClick={() => clearMocks(keyId, mockableArgs.map((a) => a.name))}
          className="text-xs text-white/20 hover:text-white/50 transition-colors"
        >
          reset
        </button>
      )}
    </div>
  );
}
