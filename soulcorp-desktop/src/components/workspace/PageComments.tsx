import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { PageComment } from "../../types/workspace";

interface PageCommentsProps {
  pageId: string;
}

export function PageComments({ pageId }: PageCommentsProps) {
  const [comments, setComments] = useState<PageComment[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<PageComment[]>("list_page_comments", { page_id: pageId })
      .then(setComments)
      .catch(() => setComments([]));
  }, [pageId]);

  const submit = async () => {
    if (!draft.trim()) {
      return;
    }
    setSaving(true);
    try {
      const comment = await invoke<PageComment>("add_page_comment", {
        request: {
          page_id: pageId,
          author: "player",
          content: draft.trim(),
        },
      });
      setComments((current) => [...current, comment]);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-comments">
      <h3>Comments</h3>
      {comments.length === 0 ? (
        <p className="muted">No comments yet. Use @AgentName to mention teammates.</p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <strong>{comment.author}</strong>
              <span className="muted"> · {new Date(comment.created_at).toLocaleString()}</span>
              <p>{comment.content}</p>
              {comment.mentions.length > 0 ? (
                <p className="muted">Mentions: {comment.mentions.map((m) => `@${m}`).join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <label className="field-label">
        Add comment
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share feedback or @Mira for follow-up"
          rows={3}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={saving || !draft.trim()}>
        {saving ? "Posting..." : "Post comment"}
      </button>
    </section>
  );
}