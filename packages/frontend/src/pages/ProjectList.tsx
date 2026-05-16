import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../api.ts";

export function ProjectList() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects,
  });

  if (isLoading) return <div className="p-8 text-white/40">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Projects</h1>
      {(!projects || projects.length === 0) ? (
        <div className="text-white/40">No projects yet. An admin needs to create one and run the importer.</div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="block bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg p-4 transition-colors"
            >
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-white/40 mt-1">Source: {p.sourceLocale}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
