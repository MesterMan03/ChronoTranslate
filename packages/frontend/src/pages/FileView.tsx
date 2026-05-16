import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../api.ts";
import { KeyRow } from "../components/KeyRow.tsx";
import type { TranslationKey } from "../types.ts";

export function FileView() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>();
  const [search, setSearch] = useState("");

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id!),
    enabled: !!id,
  });

  const { data: keys, isLoading } = useQuery({
    queryKey: ["keys", id, fileId],
    queryFn: () => api.keys(id!, fileId!),
    enabled: !!id && !!fileId,
  });

  if (isLoading || !project)
    return <div className="p-8 text-white/40">Loading...</div>;

  const filtered = (keys ?? []).filter(
    (k) =>
      !search ||
      k.key.toLowerCase().includes(search.toLowerCase()) ||
      k.sourceValue.toLowerCase().includes(search.toLowerCase())
  );

  // Group by prefix chain (first two dot-segments)
  const groups = new Map<string, TranslationKey[]>();
  for (const k of filtered) {
    const parts = k.key.split(".");
    const groupKey = parts.slice(0, 2).join(".");
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(k);
  }

  const currentFile = keys?.[0] ? null : null; // we don't store filename in key, use fileId for display

  return (
    <div className="p-8">
      <Link
        to={`/projects/${id}`}
        className="text-white/40 hover:text-white text-sm mb-4 inline-block"
      >
        ← Back to project
      </Link>
      <h1 className="text-2xl font-bold mb-4">
        {project.name} — {fileId}
      </h1>

      <input
        type="search"
        placeholder="Search keys or values..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded px-3 py-2 text-sm mb-6 focus:outline-none focus:border-blue-500"
      />

      {filtered.length === 0 ? (
        <div className="text-white/40">No keys found.</div>
      ) : (
        <div className="border border-white/10 rounded-lg overflow-hidden">
          {[...groups.entries()].map(([group, groupKeys]) => (
            <div key={group}>
              <div className="px-4 py-1.5 bg-white/3 text-xs text-white/30 border-b border-white/5 font-mono">
                {group}.*
              </div>
              {groupKeys.map((k) => (
                <KeyRow key={k.id} translationKey={k} project={project} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
