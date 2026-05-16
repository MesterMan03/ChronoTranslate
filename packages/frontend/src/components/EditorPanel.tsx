import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranslationKey, Project } from "../types.ts";
import { MiniMessagePreview } from "./MiniMessagePreview.tsx";
import { MockArgEditor } from "./MockArgEditor.tsx";
import { RawValue } from "./RawValue.tsx";
import { useMockStore, useAuthStore } from "../store.ts";
import { api } from "../api.ts";

type Props = {
  translationKey: TranslationKey;
  project: Project;
  locale: string;
  onClose: () => void;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function EditorPanel({ translationKey: k, project, locale, onClose }: Props) {
  const { getMocks } = useMockStore();
  const mocks = getMocks(k.id);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState(k.translation?.value ?? "");
  const status = k.translation?.status ?? "untranslated";

  const submitMutation = useMutation({
    mutationFn: (value: string) =>
      api.submitTranslation(project.id, k.id, locale, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 shrink-0">
        <span className="font-mono text-sm text-white/50 truncate flex-1" title={k.key}>
          {k.key}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${
            STATUS_BADGE[status] ?? "bg-white/5 text-white/25 border-white/10"
          }`}
        >
          {status}
        </span>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white text-lg leading-none px-1 shrink-0"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Source */}
        <section>
          <div className="text-xs text-white/30 mb-1.5 uppercase tracking-wider">
            Source (en)
            {k.isArray && (
              <span className="ml-2 text-white/20 normal-case">
                array · {k.sourceValue.split("\n").length} lines
              </span>
            )}
          </div>
          {k.isArray ? (
            <div className="space-y-1">
              {k.sourceValue.split("\n").map((line, i) => (
                <MiniMessagePreview
                  key={i}
                  value={line}
                  themeColors={project.themeColors}
                  mockArgs={mocks}
                />
              ))}
            </div>
          ) : (
            <MiniMessagePreview
              value={k.sourceValue}
              themeColors={project.themeColors}
              mockArgs={mocks}
            />
          )}
          <RawValue value={k.sourceValue} />
        </section>

        {/* Mock args */}
        {k.detectedArgs.length > 0 && (
          <section>
            <div className="text-xs text-white/30 mb-1.5 uppercase tracking-wider">
              Mock arguments
            </div>
            <MockArgEditor keyId={k.id} args={k.detectedArgs} />
          </section>
        )}

        {/* Translation editor */}
        {locale ? (
          <section>
            <div className="text-xs text-white/30 mb-1.5 uppercase tracking-wider">
              Translation ({locale})
            </div>
            {user ? (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => {
                    const val = k.isArray
                      ? e.target.value
                      : e.target.value.replace(/\n/g, "");
                    setDraft(val);
                  }}
                  placeholder={k.isArray ? "Enter translation… (one line per row)" : "Enter translation…"}
                  rows={k.isArray ? Math.max(3, (k.sourceValue.match(/\n/g)?.length ?? 0) + 1) : 2}
                  className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y font-mono"
                />
                {k.isArray && (
                  <p className="text-xs text-white/25 mt-1">
                    Each line becomes one array element. Lines: {draft.split("\n").length}
                  </p>
                )}

                {draft && (
                  <div className="mt-2">
                    <div className="text-xs text-white/25 mb-1">Preview</div>
                    {k.isArray ? (
                      <div className="space-y-1">
                        {draft.split("\n").map((line, i) => (
                          <MiniMessagePreview
                            key={i}
                            value={line}
                            themeColors={project.themeColors}
                            mockArgs={mocks}
                          />
                        ))}
                      </div>
                    ) : (
                      <MiniMessagePreview
                        value={draft}
                        themeColors={project.themeColors}
                        mockArgs={mocks}
                      />
                    )}
                    <RawValue value={draft} />
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => submitMutation.mutate(draft.trim())}
                    disabled={
                      !draft.trim() ||
                      submitMutation.isPending ||
                      draft === k.translation?.value
                    }
                    className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 rounded transition-colors"
                  >
                    {submitMutation.isPending ? "Saving…" : "Submit"}
                  </button>
                  {submitMutation.isSuccess && (
                    <span className="text-xs text-green-400">Saved</span>
                  )}
                  {submitMutation.isError && (
                    <span className="text-xs text-red-400">Error saving</span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-white/30">
                <a href="/auth/discord" className="text-blue-400 hover:underline">
                  Log in
                </a>{" "}
                to submit translations.
              </p>
            )}
          </section>
        ) : (
          <p className="text-xs text-white/30">
            Select a locale from the dropdown to start translating.
          </p>
        )}

        {/* Comments */}
        {locale && (
          <section>
            <CommentThread
              projectId={project.id}
              keyId={k.id}
              locale={locale}
              user={user}
            />
          </section>
        )}
      </div>
    </div>
  );
}

type CommentThreadProps = {
  projectId: string;
  keyId: string;
  locale: string;
  user: import("../types.ts").User | null;
};

function CommentThread({ projectId, keyId, locale, user }: CommentThreadProps) {
  const [newComment, setNewComment] = useState("");
  const queryClient = useQueryClient();

  const { data: commentList, isLoading } = useQuery({
    queryKey: ["comments", keyId, locale],
    queryFn: () => api.comments(projectId, keyId, locale),
  });

  const postMutation = useMutation({
    mutationFn: (content: string) =>
      api.postComment(projectId, keyId, locale, content),
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["comments", keyId, locale] });
    },
  });

  return (
    <>
      <div className="text-xs text-white/30 mb-2 uppercase tracking-wider">
        Comments {commentList ? `(${commentList.length})` : ""}
      </div>

      {isLoading && <div className="text-xs text-white/20">Loading…</div>}

      {commentList && commentList.length > 0 && (
        <div className="space-y-3 mb-3">
          {commentList.map((c) => (
            <div key={c.id} className="flex gap-2 text-sm">
              {c.avatarUrl ? (
                <img
                  src={c.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/10 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="text-white/60 font-medium text-xs">
                  {c.username}
                </span>
                <span className="text-white/20 text-xs ml-1.5">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
                <p className="text-white/75 mt-0.5 text-sm">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {user && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add a comment…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newComment.trim()) {
                postMutation.mutate(newComment.trim());
              }
            }}
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => postMutation.mutate(newComment.trim())}
            disabled={!newComment.trim() || postMutation.isPending}
            className="text-sm bg-white/10 hover:bg-white/15 disabled:opacity-40 px-3 py-1.5 rounded transition-colors"
          >
            Post
          </button>
        </div>
      )}
    </>
  );
}
