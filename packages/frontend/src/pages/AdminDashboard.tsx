import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { useAuthStore } from "../store.ts";
import type { Role, User, CustomTag } from "../types.ts";
import { MiniMessagePreview } from "../components/MiniMessagePreview.tsx";

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
  const [showBans, setShowBans] = useState<string | null>(null);

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
              <button
                onClick={() => setShowBans(showBans === p.id ? null : p.id)}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded"
              >
                Bans
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

            {/* Ban manager */}
            {showBans === p.id && (
              <BanEditor
                projectId={p.id}
                me={me}
                onClose={() => setShowBans(null)}
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
  const [newMiniMessage, setNewMiniMessage] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => api.updateProjectTags(projectId, tags),
    onSuccess: () => { onSaved(); onClose(); },
  });

  const addTag = () => {
    if (!newName.trim()) return;
    setTags((prev) => [
      ...prev.filter((t) => t.name !== newName.trim()),
      { name: newName.trim(), miniMessage: newMiniMessage },
    ]);
    setNewName("");
    setNewMiniMessage("");
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">
        Custom tags
        <span className="ml-2 normal-case text-white/20 font-normal">
          — define what &lt;tagname&gt; expands to as MiniMessage
        </span>
      </div>

      {tags.length > 0 && (
        <div className="space-y-2 mb-3">
          {tags.map((t) => (
            <div key={t.name} className="bg-white/5 border border-white/10 rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <code className="text-xs text-white/60 w-36 shrink-0 font-mono">&lt;{t.name}&gt;</code>
                <div className="flex-1 min-w-0">
                  {editingName === t.name ? (
                    <input
                      value={t.miniMessage}
                      autoFocus
                      onChange={(e) =>
                        setTags((prev) =>
                          prev.map((x) => x.name === t.name ? { ...x, miniMessage: e.target.value } : x)
                        )
                      }
                      onBlur={() => setEditingName(null)}
                      placeholder="<gold>[Party] </gold>"
                      className="w-full bg-transparent border-b border-white/20 text-xs font-mono focus:outline-none focus:border-blue-400 py-0.5"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingName(t.name)}
                      className="text-xs font-mono text-white/40 hover:text-white/70 text-left truncate w-full"
                      title="Click to edit"
                    >
                      {t.miniMessage || <span className="italic text-white/20">empty</span>}
                    </button>
                  )}
                </div>
                <button
                  onClick={() =>
                    setTags((prev) =>
                      prev.map((x) => x.name === t.name ? { ...x, nonMockable: !x.nonMockable } : x)
                    )
                  }
                  title={t.nonMockable ? "Built-in (not mockable) — click to allow mocking" : "Allow mocking — click to mark as built-in"}
                  className={`text-xs px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
                    t.nonMockable
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
                      : "bg-white/5 text-white/20 border-white/10 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20"
                  }`}
                >
                  built-in
                </button>
                <button
                  onClick={() => setTags((prev) => prev.filter((x) => x.name !== t.name))}
                  className="text-white/20 hover:text-red-400 text-sm shrink-0 ml-1"
                >
                  ×
                </button>
              </div>
              {t.miniMessage && (
                <div className="border-t border-white/5 px-3 py-1.5">
                  <div className="text-xs text-white/20 mb-1">Preview</div>
                  <MiniMessagePreview value={t.miniMessage} className="text-xs py-1" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded p-3 mb-3">
        <div className="text-xs text-white/30 mb-2">Add tag</div>
        <div className="flex gap-2 mb-2">
          <div>
            <label className="text-xs text-white/20 block mb-1">Tag name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="primary"
              className="w-32 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-white/20 block mb-1">MiniMessage replacement</label>
            <input
              value={newMiniMessage}
              onChange={(e) => setNewMiniMessage(e.target.value)}
              placeholder="<color:#5865F2>"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={addTag}
            disabled={!newName.trim()}
            className="text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 px-3 py-1 rounded self-end"
          >
            Add
          </button>
        </div>
        {newMiniMessage && (
          <div>
            <div className="text-xs text-white/20 mb-1">Preview</div>
            <MiniMessagePreview value={newMiniMessage} className="text-xs py-1" />
          </div>
        )}
        <p className="text-xs text-white/20 mt-2">
          Wrapping tags: use <code className="font-mono">&lt;color:#hex&gt;</code> — the closing &lt;/tagname&gt; maps to &lt;/color&gt;. Self-contained: include all formatting inline, e.g. <code className="font-mono">&lt;gold&gt;[Party] &lt;/gold&gt;</code>.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 rounded"
        >
          {saveMutation.isPending ? "Saving…" : "Save tags"}
        </button>
        <button onClick={onClose} className="text-sm bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

function BanEditor({
  projectId,
  me,
  onClose,
}: {
  projectId: string;
  me: User;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: allUsers } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => api.adminUsers(),
  });

  const { data: bans, isLoading } = useQuery({
    queryKey: ["projectBans", projectId],
    queryFn: () => api.projectBans(projectId),
  });

  const banMutation = useMutation({
    mutationFn: (userId: string) => api.banUser(projectId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectBans", projectId] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => api.unbanUser(projectId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projectBans", projectId] }),
  });

  const bannedIds = new Set(bans?.map((b) => b.userId) ?? []);

  // Only show users the current admin can actually ban
  const bannable = (allUsers ?? []).filter((u) => {
    if (u.id === me.id) return false;
    if (u.role === "superadmin") return false;
    return !(me.role !== "superadmin" && u.role === "admin");
  });

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="text-xs text-white/40 mb-3 uppercase tracking-wider">
        Project bans
        <span className="ml-2 normal-case text-white/20 font-normal">
          — banned users cannot submit translations or comments
        </span>
      </div>

      {isLoading && <div className="text-xs text-white/30">Loading…</div>}

      {bannable.length === 0 && !isLoading && (
        <p className="text-xs text-white/20">No bannable users.</p>
      )}

      {bannable.length > 0 && (
        <div className="space-y-1 mb-3">
          {bannable.map((u) => {
            const isBanned = bannedIds.has(u.id);
            const busy = banMutation.isPending || unbanMutation.isPending;
            return (
              <div key={u.id} className="flex items-center gap-3 px-3 py-2 bg-white/5 border border-white/10 rounded">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/10 shrink-0" />
                )}
                <span className="text-sm flex-1 min-w-0 truncate">{u.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${ROLE_BADGE[u.role as Role]}`}>
                  {u.role}
                </span>
                {isBanned && (
                  <span className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
                    banned
                  </span>
                )}
                <button
                  onClick={() =>
                    isBanned ? unbanMutation.mutate(u.id) : banMutation.mutate(u.id)
                  }
                  disabled={busy}
                  className={`text-xs px-2 py-1 rounded border disabled:opacity-40 transition-colors shrink-0 ${
                    isBanned
                      ? "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                      : "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                  }`}
                >
                  {isBanned ? "Unban" : "Ban"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={onClose} className="text-sm bg-white/5 hover:bg-white/10 px-4 py-1.5 rounded">
        Close
      </button>
    </div>
  );
}
