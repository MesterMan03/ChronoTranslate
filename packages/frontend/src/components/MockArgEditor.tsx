import type { DetectedArg } from "../types.ts";
import { useMockStore } from "../store.ts";

type Props = {
  keyId: string;
  args: DetectedArg[];
};

export function MockArgEditor({ keyId, args }: Props) {
  const { setMock, getMocks } = useMockStore();
  const mocks = getMocks(keyId);

  if (args.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {args.map((arg) => (
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
    </div>
  );
}
