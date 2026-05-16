import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranslationKey, Project, Comment, Suggestion } from "../types.ts";
import { MiniMessagePreview } from "./MiniMessagePreview.tsx";
import { MockArgEditor } from "./MockArgEditor.tsx";
import { RawValue } from "./RawValue.tsx";
import { useMockStore, useAuthStore, useUserCache } from "../store.ts";
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
  superseded: "bg-white/5 text-white/20 border-white/10",
};

export function EditorPanel({ translationKey: k, project, locale, onClose }: Props) {
  const { getMocks } = useMockStore();
  const mocks = getMocks(k.id);
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState(k.translation?.value ?? "");

  const canReview = user && (user.role === "reviewer" || user.role === "admin" || user.role === "superadmin");

  // Derive display status for the badge
  const effectiveStatus =
    k.translation?.status === "approved"
      ? "approved"
      : (k.pendingCount ?? 0) > 0
      ? "pending"
      : "untranslated";

  const submitMutation = useMutation({
    mutationFn: (value: string) =>
      api.submitTranslation(project.id, k.id, locale, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      queryClient.invalidateQueries({ queryKey: ["suggestions", k.id, locale] });
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
            STATUS_BADGE[effectiveStatus] ?? "bg-white/5 text-white/25 border-white/10"
          }`}
        >
          {effectiveStatus}
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
            Source ({project.sourceLocale})
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
                  customTags={project.customTags}
                  mockArgs={mocks}
                />
              ))}
            </div>
          ) : (
            <MiniMessagePreview
              value={k.sourceValue}
              themeColors={project.themeColors}
              customTags={project.customTags}
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
                            customTags={project.customTags}
                            mockArgs={mocks}
                          />
                        ))}
                      </div>
                    ) : (
                      <MiniMessagePreview
                        value={draft}
                        themeColors={project.themeColors}
                        customTags={project.customTags}
                        mockArgs={mocks}
                      />
                    )}
                    <RawValue value={draft} />
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => submitMutation.mutate(draft.trim())}
                    disabled={!draft.trim() || submitMutation.isPending}
                    className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 rounded transition-colors"
                  >
                    {submitMutation.isPending ? "Saving…" : "Submit suggestion"}
                  </button>
                  {submitMutation.isSuccess && (
                    <span className="text-xs text-green-400">Submitted</span>
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

        {/* Suggestions timeline */}
        {locale && (
          <section>
            <SuggestionsTimeline
              projectId={project.id}
              keyId={k.id}
              locale={locale}
              project={project}
              mocks={mocks}
              canReview={!!canReview}
            />
          </section>
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

// ─── Suggestions timeline ──────────────────────────────────────────────────

function SuggestionsTimeline({
  projectId,
  keyId,
  locale,
  project,
  mocks,
  canReview,
}: {
  projectId: string;
  keyId: string;
  locale: string;
  project: Project;
  mocks: Record<string, string>;
  canReview: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggestions", keyId, locale],
    queryFn: () => api.suggestions(projectId, keyId, locale),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", keyId, locale] });
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["pendingCount"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectSuggestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggestions", keyId, locale] });
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["pendingCount"] });
    },
  });

  if (isLoading || !suggestions || suggestions.length === 0) return null;

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <>
      <div className="text-xs text-white/30 mb-2 uppercase tracking-wider">
        Suggestions ({suggestions.length})
      </div>
      <div className="space-y-2">
        {[...suggestions].reverse().map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            project={project}
            mocks={mocks}
            canReview={canReview}
            onApprove={() => approveMutation.mutate(s.id)}
            onReject={() => rejectMutation.mutate(s.id)}
            busy={busy}
          />
        ))}
      </div>
    </>
  );
}

function SuggestionCard({
  suggestion: s,
  project,
  mocks,
  canReview,
  onApprove,
  onReject,
  busy,
}: {
  suggestion: Suggestion;
  project: Project;
  mocks: Record<string, string>;
  canReview: boolean;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(s.status === "pending" || s.status === "approved");

  return (
    <div className={`border rounded-lg overflow-hidden text-sm ${
      s.status === "approved"
        ? "border-green-500/30 bg-green-500/5"
        : s.status === "pending"
        ? "border-yellow-500/20 bg-yellow-500/5"
        : "border-white/5 bg-white/2 opacity-50"
    }`}>
      <div className="flex items-center gap-2 px-3 py-2">
        {s.submitterAvatar ? (
          <img src={s.submitterAvatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-white/10 shrink-0" />
        )}
        <span className="text-white/60 text-xs font-medium">{s.submitterName ?? "imported"}</span>
        <span className="text-white/20 text-xs">{new Date(s.submittedAt).toLocaleDateString()}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded border ml-auto shrink-0 ${STATUS_BADGE[s.status]}`}>
          {s.status}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-white/30 hover:text-white/60 text-xs ml-1"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-2">
          <MiniMessagePreview
            value={s.value}
            themeColors={project.themeColors}
            customTags={project.customTags}
            mockArgs={mocks}
          />
          <RawValue value={s.value} />
          {canReview && s.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={onApprove}
                disabled={busy}
                className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 px-3 py-1 rounded transition-colors"
              >
                ✓ Approve
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="text-xs bg-red-800 hover:bg-red-700 disabled:opacity-40 px-3 py-1 rounded transition-colors"
              >
                ✗ Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Comment thread ────────────────────────────────────────────────────────

type CommentThreadProps = {
  projectId: string;
  keyId: string;
  locale: string;
  user: import("../types.ts").User | null;
};

function CommentThread({ projectId, keyId, locale, user }: CommentThreadProps) {
  const queryClient = useQueryClient();
  const { addUsers } = useUserCache();

  const { data: commentList, isLoading } = useQuery({
    queryKey: ["comments", keyId, locale],
    queryFn: () => api.comments(projectId, keyId, locale),
    select: (data) => {
      // Cache all users for mention autocomplete
      addUsers(data.map((c) => ({ id: c.userId, username: c.username, avatarUrl: c.avatarUrl })));
      return data;
    },
  });

  const postMutation = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: string }) =>
      api.postComment(projectId, keyId, locale, content, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", keyId, locale] });
    },
  });

  // Build tree: root comments + their replies
  const roots = commentList?.filter((c) => !c.parentId) ?? [];
  const repliesFor = (id: string) => commentList?.filter((c) => c.parentId === id) ?? [];

  return (
    <>
      <div className="text-xs text-white/30 mb-2 uppercase tracking-wider">
        Comments {commentList ? `(${commentList.length})` : ""}
      </div>

      {isLoading && <div className="text-xs text-white/20">Loading…</div>}

      {roots.length > 0 && (
        <div className="space-y-3 mb-3">
          {roots.map((c) => (
            <CommentBubble
              key={c.id}
              comment={c}
              replies={repliesFor(c.id)}
              allComments={commentList ?? []}
              onReply={user ? (content, pid) => postMutation.mutate({ content, parentId: pid }) : undefined}
              postPending={postMutation.isPending}
              user={user}
            />
          ))}
        </div>
      )}

      {user && (
        <MentionInput
          placeholder="Add a comment…"
          onSubmit={(content) => postMutation.mutate({ content })}
          disabled={postMutation.isPending}
        />
      )}
    </>
  );
}

function CommentBubble({
  comment: c,
  replies,
  allComments,
  onReply,
  postPending,
  user,
}: {
  comment: Comment;
  replies: Comment[];
  allComments: Comment[];
  onReply?: (content: string, parentId: string) => void;
  postPending: boolean;
  user: import("../types.ts").User | null;
}) {
  const [showReply, setShowReply] = useState(false);
  const repliesFor = (id: string) => allComments.filter((c) => c.parentId === id);

  return (
    <div className="flex gap-2 text-sm">
      {c.avatarUrl ? (
        <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-white/10 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-white/60 font-medium text-xs">{c.username}</span>
          <span className="text-white/20 text-xs">{new Date(c.createdAt).toLocaleDateString()}</span>
        </div>
        <p className="text-white/75 mt-0.5 text-sm break-words">
          <CommentContent content={c.content} />
        </p>
        {user && onReply && (
          <button
            onClick={() => setShowReply((v) => !v)}
            className="text-xs text-white/25 hover:text-white/50 mt-1"
          >
            Reply
          </button>
        )}
        {showReply && onReply && (
          <div className="mt-2">
            <MentionInput
              placeholder={`Reply to ${c.username}…`}
              onSubmit={(content) => {
                onReply(content, c.id);
                setShowReply(false);
              }}
              disabled={postPending}
              autoFocus
            />
          </div>
        )}
        {replies.length > 0 && (
          <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
            {replies.map((r) => (
              <CommentBubble
                key={r.id}
                comment={r}
                replies={repliesFor(r.id)}
                allComments={allComments}
                onReply={onReply}
                postPending={postPending}
                user={user}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentContent({ content }: { content: string }) {
  const { users } = useUserCache();
  const usernameSet = new Set(users.map((u) => u.username.toLowerCase()));

  // Split on @mentions and highlight known ones
  const parts = content.split(/(@\S+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@") && usernameSet.has(part.slice(1).toLowerCase())) {
          return (
            <span key={i} className="text-blue-400 font-medium">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ─── Mention-aware input ───────────────────────────────────────────────────

function MentionInput({
  placeholder,
  onSubmit,
  disabled,
  autoFocus,
}: {
  placeholder: string;
  onSubmit: (content: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { users } = useUserCache();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const filteredUsers =
    mentionQuery !== null
      ? users
          .filter((u) => u.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);

    // Detect @mention: find the last @ before the cursor
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf("@");

    if (atIdx !== -1) {
      const queryText = textBeforeCursor.slice(atIdx + 1);
      // Only show autocomplete if no space between @ and cursor
      if (!queryText.includes(" ") && !queryText.includes("\n")) {
        setMentionQuery(queryText);
        setMentionStart(atIdx);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (username: string) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newVal = `${before}@${username} ${after}`;
    setValue(newVal);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault();
      if (mentionQuery !== null && filteredUsers.length > 0) {
        insertMention(filteredUsers[0].username);
        return;
      }
      onSubmit(value.trim());
      setValue("");
    }
    if (e.key === "Escape") setMentionQuery(null);
  };

  return (
    <div className="relative">
      {mentionQuery !== null && filteredUsers.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 bg-zinc-900 border border-white/20 rounded shadow-lg z-10 w-48">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors"
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-white/10" />
              )}
              <span className="text-white/80">{u.username}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
        <button
          onClick={() => {
            if (value.trim()) { onSubmit(value.trim()); setValue(""); }
          }}
          disabled={!value.trim() || disabled}
          className="text-sm bg-white/10 hover:bg-white/15 disabled:opacity-40 px-3 py-1.5 rounded transition-colors"
        >
          Post
        </button>
      </div>
    </div>
  );
}
