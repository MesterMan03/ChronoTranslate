import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api.ts";
import { KeyRow } from "../components/KeyRow.tsx";
import { EditorPanel } from "../components/EditorPanel.tsx";
import type { TranslationKey } from "../types.ts";

export function FileView() {
  const { id, fileId } = useParams<{ id: string; fileId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const locale = searchParams.get("locale") ?? "";

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id!),
    enabled: !!id,
  });

  const { data: keys, isLoading } = useQuery({
    queryKey: ["keys", id, fileId, locale],
    queryFn: () => api.keys(id!, fileId!, locale || undefined),
    enabled: !!id && !!fileId,
  });

  if (isLoading || !project)
    return <div className="p-8 text-white/40">Loading...</div>;

  const locales = project.locales ?? [];

  // Derive selected key from live query data so it auto-updates after submit
  const selectedKey = selectedKeyId
    ? (keys?.find((k) => k.id === selectedKeyId) ?? null)
    : null;

  const filtered = (keys ?? []).filter(
    (k) =>
      !search ||
      k.key.toLowerCase().includes(search.toLowerCase()) ||
      k.sourceValue.toLowerCase().includes(search.toLowerCase())
  );

  const groups = new Map<string, TranslationKey[]>();
  for (const k of filtered) {
    const parts = k.key.split(".");
    const groupKey = parts.slice(0, 2).join(".");
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(k);
  }

  const panelOpen = selectedKey !== null;

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* Left: key list */}
      <div
        className="flex flex-col overflow-hidden transition-all duration-300 ease-in-out shrink-0"
        style={{ width: panelOpen ? "42%" : "100%" }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 shrink-0">
          <Link
            to={`/projects/${id}`}
            className="text-white/40 hover:text-white text-sm"
          >
            ←
          </Link>
          <input
            type="search"
            placeholder="Search keys or values…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          {locales.length > 0 && (
            <select
              value={locale}
              onChange={(e) =>
                setSearchParams(e.target.value ? { locale: e.target.value } : {})
              }
              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500 shrink-0"
            >
              <option value="">Source only</option>
              {locales.map((l) => (
                <option key={l.id} value={l.localeCode}>
                  {l.displayName} ({l.localeCode})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Key list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-white/40 text-sm">No keys found.</div>
          ) : (
            [...groups.entries()].map(([group, groupKeys]) => (
              <div key={group}>
                <div className="px-4 py-1.5 bg-white/3 text-xs text-white/25 border-b border-white/5 font-mono sticky top-0 z-10">
                  {group}.*
                </div>
                {groupKeys.map((k) => (
                  <KeyRow
                    key={k.id}
                    translationKey={k}
                    isSelected={selectedKeyId === k.id}
                    compact={panelOpen}
                    onClick={() =>
                      setSelectedKeyId((prev) => (prev === k.id ? null : k.id))
                    }
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: editor panel */}
      <div
        className="border-l border-white/10 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: panelOpen ? "58%" : "0%" }}
      >
        {selectedKey && (
          <EditorPanel
            translationKey={selectedKey}
            project={project}
            locale={locale}
            onClose={() => setSelectedKeyId(null)}
          />
        )}
      </div>
    </div>
  );
}
