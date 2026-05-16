import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PendingItem } from "../api.ts";
import { MiniMessagePreview } from "../components/MiniMessagePreview.tsx";
import { MockArgEditor } from "../components/MockArgEditor.tsx";
import { RawValue } from "../components/RawValue.tsx";
import { useAuthStore, useMockStore } from "../store.ts";

const PAGE_SIZE = 50;

export function ReviewDashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [filterProject, setFilterProject] = useState("");
  const [filterLocale, setFilterLocale] = useState("");

  const { data: projects } = useQuery({
    queryKey: ["adminProjects"],
    queryFn: () => api.adminProjects(),
    enabled: !!(user && (user.role === "admin" || user.role === "superadmin")),
  });

  const { data: pending, isLoading } = useQuery({
    queryKey: ["pending", filterProject, filterLocale, offset],
    queryFn: () =>
      api.pendingTranslations({
        projectId: filterProject || undefined,
        localeCode: filterLocale || undefined,
        offset,
      }),
    enabled: !!(user && (user.role === "reviewer" || user.role === "admin" || user.role === "superadmin")),
  });

  const { data: countData } = useQuery({
    queryKey: ["pendingCount"],
    queryFn: () => api.pendingCount(),
    enabled: !!(user && (user.role === "reviewer" || user.role === "admin" || user.role === "superadmin")),
  });

  const approveMutation = useMutation({
    mutationFn: (item: PendingItem) => api.approveSuggestion(item.translationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["pendingCount"] });
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (item: PendingItem) => api.rejectSuggestion(item.translationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["pendingCount"] });
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });

  if (!user || (user.role !== "reviewer" && user.role !== "admin" && user.role !== "superadmin")) {
    return (
      <div className="p-8 text-white/40">
        You need reviewer permissions to access this page.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Review Queue</h1>
        {countData && (
          <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs px-2 py-0.5 rounded-full">
            {countData.total} pending
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        {projects && (
          <select
            value={filterProject}
            onChange={(e) => { setFilterProject(e.target.value); setOffset(0); }}
            className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          placeholder="Filter by locale code…"
          value={filterLocale}
          onChange={(e) => { setFilterLocale(e.target.value); setOffset(0); }}
          className="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 w-48"
        />
      </div>

      {isLoading && <div className="text-white/40">Loading…</div>}

      {pending && pending.length === 0 && (
        <div className="text-white/30 text-center py-16">No pending translations</div>
      )}

      <div className="space-y-3">
        {pending?.map((item) => (
          <PendingCard
            key={item.translationId}
            item={item}
            onApprove={() => approveMutation.mutate(item)}
            onReject={() => rejectMutation.mutate(item)}
            busy={approveMutation.isPending || rejectMutation.isPending}
          />
        ))}
      </div>

      {/* Pagination */}
      {pending && (pending.length === PAGE_SIZE || offset > 0) && (
        <div className="flex gap-3 mt-6 justify-center">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="text-sm bg-white/5 hover:bg-white/10 disabled:opacity-40 px-4 py-1.5 rounded"
          >
            ← Prev
          </button>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={pending.length < PAGE_SIZE}
            className="text-sm bg-white/5 hover:bg-white/10 disabled:opacity-40 px-4 py-1.5 rounded"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function PendingCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: PendingItem;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { getMocks } = useMockStore();
  const mocks = getMocks(item.keyId);

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-xs text-white/40 hover:text-white/70 truncate flex-1 text-left"
          title={item.key}
        >
          <span className="text-white/20 mr-2">{item.projectName} · {item.localeName}</span>
          {item.key}
        </button>
        <span className="text-xs text-white/30 shrink-0">
          {item.submitterName ?? "anonymous"} ·{" "}
          {new Date(item.submittedAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={busy}
            className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-40 px-3 py-1 rounded transition-colors"
          >
            ✓
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="text-sm bg-red-800 hover:bg-red-700 disabled:opacity-40 px-3 py-1 rounded transition-colors"
          >
            ✗
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3 text-sm">
          {item.detectedArgs.length > 0 && (
            <div>
              <div className="text-xs text-white/30 mb-1 uppercase tracking-wider">Mock arguments</div>
              <MockArgEditor keyId={item.keyId} args={item.detectedArgs} customTags={item.customTags} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/30 mb-1 uppercase tracking-wider">
                Source ({item.filePath})
              </div>
              {item.isArray ? (
                item.sourceValue.split("\n").map((line, i) => (
                  <MiniMessagePreview key={i} value={line} customTags={item.customTags} mockArgs={mocks} />
                ))
              ) : (
                <MiniMessagePreview value={item.sourceValue} customTags={item.customTags} mockArgs={mocks} />
              )}
              <RawValue value={item.sourceValue} />
            </div>
            <div>
              <div className="text-xs text-white/30 mb-1 uppercase tracking-wider">
                Translation ({item.localeCode})
              </div>
              {item.isArray ? (
                item.value.split("\n").map((line, i) => (
                  <MiniMessagePreview key={i} value={line} customTags={item.customTags} mockArgs={mocks} />
                ))
              ) : (
                <MiniMessagePreview value={item.value} customTags={item.customTags} mockArgs={mocks} />
              )}
              <RawValue value={item.value} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
