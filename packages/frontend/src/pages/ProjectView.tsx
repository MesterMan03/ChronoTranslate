import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api } from "../api.ts";

export function ProjectView() {
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id!),
    enabled: !!id,
  });

  const { data: files, isLoading: loadingFiles } = useQuery({
    queryKey: ["files", id],
    queryFn: () => api.files(id!),
    enabled: !!id,
  });

  if (loadingProject || loadingFiles)
    return <div className="p-8 text-white/40">Loading...</div>;
  if (!project) return <div className="p-8 text-red-400">Project not found</div>;

  // Group files by top-level category (first path segment before /)
  const grouped = new Map<string, typeof files>();
  for (const file of files ?? []) {
    const group = file.filePath.includes("/")
      ? file.filePath.split("/")[0]
      : "_root";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(file);
  }

  return (
    <div className="p-8">
      <Link to="/" className="text-white/40 hover:text-white text-sm mb-4 inline-block">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
      <div className="text-sm text-white/40 mb-6">Source: {project.sourceLocale}</div>

      {project.locales && project.locales.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {project.locales.map((l) => (
            <span
              key={l.id}
              className="bg-white/5 border border-white/10 rounded px-3 py-1 text-sm"
            >
              {l.displayName} ({l.localeCode}) — {parseFloat(l.progressPct).toFixed(0)}%
            </span>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Translation Files</h2>
      {(!files || files.length === 0) ? (
        <div className="text-white/40">No files imported yet.</div>
      ) : (
        <div className="grid gap-2">
          {[...grouped.entries()].map(([group, groupFiles]) => (
            <div key={group}>
              {group !== "_root" && (
                <div className="text-xs text-white/30 uppercase tracking-wider mb-1 mt-3">
                  {group}
                </div>
              )}
              {groupFiles!.map((file) => (
                <Link
                  key={file.id}
                  to={`/projects/${id}/files/${file.id}`}
                  className="block bg-white/5 hover:bg-white/8 border border-white/10 rounded px-4 py-2.5 text-sm transition-colors mb-1"
                >
                  {file.filePath}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
