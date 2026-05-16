import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { useAuthStore } from "../store.ts";
import type { Role, User, CustomTag } from "../types.ts";

const ROLE_ORDER: Role[] = ["translator", "reviewer", "admin", "superadmin"];

const ROLE_BADGE: Record<Role, string> = {
  translator: "bg-white/5 text-white/40 border-white/10",
  reviewer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  superadmin: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

export function AdminDashboard() {
  const { user: me } = useAuthStore();
  const queryClient = useQueryClient();

  if (!me || (me.role !== "admin" && me.role !== "superadmin")) {
    return (
      <div className="p-8 text-white/40">
        You need admin permissions to access this page.
      </div>
    );
  }

  return (
    <div className="p-8 space-y-10 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <UsersSection me={me} queryClient={queryClient} />
      <ProjectsSection me={me} queryClient={queryClient} />
    </div>
  );
}

function UsersSection({ me, queryClient }: { me: User; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: users, isLoading } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => api.adminUsers(),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api.setUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminUsers"] }),
  });

  const assignableRoles = (target: User): Role[] => {
    if (target.role === "superadmin") return []; // cannot change superadmin
    if (me.role === "superadmin") return ["translator", "reviewer", "admin"];
    return ["translator", "reviewer"]; // admin can only assign up to reviewer
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">Users</h2>
      {isLoading && <div className="text-white/40">Loading…</div>}
      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        {users?.map((u, i) => (
          <div
            key={u.id}
            className={`flex items-center gap-4 px-4 py-3 ${i !== 0 ? "border-t border-white/5" : ""}`}
          >
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{u.username}</span>
              {u.id === me.id && (
                <span className="text-xs text-white/30 ml-2">(you)</span>
              )}
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded border shrink-0 ${ROLE_BADGE[u.role as Role]}`}
            >
              {u.role}
            </span>
            {u.id !== me.id && assignableRoles(u).length > 0 ? (
              <select
                value={u.role}
                onChange={(e) =>
                  roleMutation.mutate({ userId: u.id, role: e.target.value as Role })
                }
                disabled={roleMutation.isPending}
                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-40"
              >
                {assignableRoles(u).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            ) : (
              <div className="w-24" /> // spacer to keep alignment
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectsSection({ me, queryClient }: { me: User; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["adminProjects"],
    queryFn: () => api.adminProjects(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [showAddLocale, setShowAddLocale] = useState<string | null>(null);
  const [showImport, setShowImport] = useState<string | null>(null);
  const [showTags, setShowTags] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; sourceLocale: string; githubOwner?: string; githubRepo?: string }) =>
      api.createProject(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminProjects"] });
      setShowCreate(false);
    },
  });

  const addLocaleMutation = useMutation({
    mutationFn: ({ projectId, localeCode, displayName }: { projectId: string; localeCode: string; displayName: string }) =>
      api.addLocale(projectId, localeCode, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminProjects"] });
      setShowAddLocale(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ projectId, langDir }: { projectId: string; langDir: string }) =>
      api.importProject(projectId, langDir),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["adminProjects"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      alert(`Import complete: ${data.filesImported} files, ${data.keysImported} keys`);
      setShowImport(null);
    },
  });

  return (
    <section>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded transition-colors"
        >
          + New Project
        </button>
      </div>

      {showCreate && (
        <CreateProjectForm
          onSubmit={(vals) => createMutation.mutate(vals)}
          busy={createMutation.isPending}
          error={createMutation.error?.message}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {isLoading && <div className="text-white/40">Loading…</div>}

      <div className="space-y-4">
        {projects?.map((p) => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-white/30">
                source: {p.sourceLocale} · {p.keyCount} keys
              </span>
              {p.githubOwner && p.githubRepo && (
                <span className="text-xs text-white/20">
                  {p.githubOwner}/{p.githubRepo}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowAddLocale(showAddLocale === p.id ? null : p.id)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded"
              >
                + Locale
              </button>
              <button
                onClick={() => setShowImport(showImport === p.id ? null : p.id)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded"
              >
                Import
              </button>
              <button
                onClick={() => setShowTags(showTags === p.id ? null : p.id)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded"
              >
                Tags
              </button>
            </div>

            {/* Locale progress */}
            {p.locales.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {p.locales.map((l) => {
                  const pct = parseFloat(l.progressPct);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-2 bg-white/5 border border-white/10 rounded px-3 py-1.5"
                    >
                      <span className="text-sm">{l.displayName}</span>
                      <span className="text-xs text-white/30">{l.localeCode}</span>
                      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/40 w-8 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-white/20">No locales registered yet.</p>
            )}

            {/* Add locale inline form */}
            {showAddLocale === p.id && (
              <AddLocaleForm
                onSubmit={(lc, dn) => addLocaleMutation.mutate({ projectId: p.id, localeCode: lc, displayName: dn })}
                busy={addLocaleMutation.isPending}
                error={addLocaleMutation.error?.message}
                onCancel={() => setShowAddLocale(null)}
              />
            )}

            {/* Import inline form */}
            {showImport === p.id && (
              <ImportForm
                onSubmit={(dir) => importMutation.mutate({ projectId: p.id, langDir: dir })}
                busy={importMutation.isPending}
                error={importMutation.error?.message}
                onCancel={() => setShowImport(null)}
              />
            )}

            {/* Custom tags editor */}
            {showTags === p.id && (
              <CustomTagsEditor
                projectId={p.id}
                initialTags={p.customTags}
                onClose={() => setShowTags(null)}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ["adminProjects"] })}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CreateProjectForm({
  onSubmit,
  busy,
  error,
  onCancel,
}: {
  onSubmit: (v: { name: string; sourceLocale: string; githubOwner?: string; githubRepo?: string }) => void;
  busy: boolean;
  error?: string;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [sourceLocale, setSourceLocale] = useState("en");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold mb-3">New Project</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-white/40 block mb-1">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ChronoCore"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-white/40 block mb-1">Source locale</label>
          <input
            value={sourceLocale}
            onChange={(e) => setSourceLocale(e.target.value)}
            placeholder="en"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-white/40 block mb-1">GitHub owner</label>
          <input
            value={githubOwner}
            onChange={(e) => setGithubOwner(e.target.value)}
            placeholder="MesterMan03"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-white/40 block mb-1">GitHub repo</label>
          <input
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="ChronoCore"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() =>
            onSubmit({
              name,
              sourceLocale,
              githubOwner: githubOwner || undefined,
              githubRepo: githubRepo || undefined,
            })
          }
          disabled={!name.trim() || busy}
          className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 rounded transition-colors"
        >
          {busy ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="text-sm bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddLocaleForm({
  onSubmit,
  busy,
  error,
  onCancel,
}: {
  onSubmit: (localeCode: string, displayName: string) => void;
  busy: boolean;
  error?: string;
  onCancel: () => void;
}) {
  const [localeCode, setLocaleCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  return (
    <div className="mt-3 border-t border-white/10 pt-3 flex items-end gap-3">
      <div>
        <label className="text-xs text-white/40 block mb-1">Locale code</label>
        <input
          value={localeCode}
          onChange={(e) => setLocaleCode(e.target.value)}
          placeholder="de"
          className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="text-xs text-white/40 block mb-1">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="German"
          className="w-40 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => onSubmit(localeCode, displayName)}
        disabled={!localeCode.trim() || !displayName.trim() || busy}
        className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3 py-1.5 rounded transition-colors"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        onClick={onCancel}
        className="text-sm bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ImportForm({
  onSubmit,
  busy,
  error,
  onCancel,
}: {
  onSubmit: (langDir: string) => void;
  busy: boolean;
  error?: string;
  onCancel: () => void;
}) {
  const [langDir, setLangDir] = useState("");

  return (
    <div className="mt-3 border-t border-white/10 pt-3 flex items-end gap-3">
      <div className="flex-1">
        <label className="text-xs text-white/40 block mb-1">Lang directory (parent folder)</label>
        <input
          value={langDir}
          onChange={(e) => setLangDir(e.target.value)}
          placeholder="/path/to/resources/lang"
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 font-mono"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={() => onSubmit(langDir)}
        disabled={!langDir.trim() || busy}
        className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
      >
        {busy ? "Importing…" : "Run Import"}
      </button>
      <button
        onClick={onCancel}
        className="text-sm bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function CustomTagsEditor({
  projectId,
  initialTags,
  onClose,
  onSaved,
}: {
  projectId: string;
  initialTags: CustomTag[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<CustomTag[]>(initialTags);
  const [newName, setNewName] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [newColor, setNewColor] = useState("#5865F2");

  const saveMutation = useMutation({
    mutationFn: () => api.updateProjectTags(projectId, tags),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const addTag = () => {
    if (!newName.trim() || !newDisplay.trim()) return;
    setTags((prev) => [
      ...prev.filter((t) => t.name !== newName.trim()),
      { name: newName.trim(), display: newDisplay, color: newColor },
    ]);
    setNewName("");
    setNewDisplay("");
    setNewColor("#5865F2");
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">Custom tags</div>
      {tags.length > 0 && (
        <div className="space-y-1 mb-3">
          {tags.map((t) => (
            <div key={t.name} className="flex items-center gap-2 bg-white/5 rounded px-3 py-1.5">
              <code className="text-xs text-white/60 w-36 shrink-0">&lt;{t.name}&gt;</code>
              <span className="text-sm" style={{ color: t.color }}>{t.display}</span>
              <input
                type="color"
                value={t.color}
                onChange={(e) =>
                  setTags((prev) => prev.map((x) => x.name === t.name ? { ...x, color: e.target.value } : x))
                }
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 ml-auto"
                title="Change color"
              />
              <button
                onClick={() => setTags((prev) => prev.filter((x) => x.name !== t.name))}
                className="text-white/20 hover:text-red-400 text-sm"
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 mb-3 flex-wrap">
        <div>
          <label className="text-xs text-white/30 block mb-1">Tag name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="party_prefix"
            className="w-32 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-1">Display text</label>
          <input value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} placeholder="[Party] "
            className="w-28 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-1">Color</label>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
            className="h-7 w-10 rounded cursor-pointer bg-transparent border border-white/10" />
        </div>
        <button onClick={addTag} disabled={!newName.trim() || !newDisplay.trim()}
          className="text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 px-3 py-1.5 rounded self-end">
          Add
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 rounded">
          {saveMutation.isPending ? "Saving…" : "Save tags"}
        </button>
        <button onClick={onClose} className="text-sm bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}
