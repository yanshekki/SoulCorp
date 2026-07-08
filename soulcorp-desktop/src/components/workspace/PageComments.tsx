import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { PageComment } from "../../types/workspace";
import { filterByQuery } from "../../utils/listSearch";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "../UI/PaginationBar";
import { SearchableListToolbar } from "../UI/SearchableListToolbar";

const COMMENT_PAGE_SIZE = 15;

interface PageCommentsProps {
  pageId: string;
}

export function PageComments({ pageId }: PageCommentsProps) {
  const [comments, setComments] = useState<PageComment[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

  useEffect(() => {
    void invoke<PageComment[]>("list_page_comments", { pageId })
      .then(setComments)
      .catch(() => setComments([]));
    setSearchQuery("");
    setListPage(0);
  }, [pageId]);

  const filteredComments = useMemo(
    () =>
      filterByQuery(comments, debouncedQuery, (comment) => [
        comment.author,
        comment.content,
        ...comment.mentions,
      ]),
    [comments, debouncedQuery],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredComments, listPage, COMMENT_PAGE_SIZE),
    [filteredComments, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, comments.length]);

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
      {comments.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Search comments…"
          ariaLabel="Search comments"
          matchCount={debouncedQuery.trim() ? filteredComments.length : undefined}
          totalCount={comments.length}
        />
      ) : null}
      {comments.length === 0 ? (
        <p className="muted">No comments yet. Use @AgentName to mention teammates.</p>
      ) : debouncedQuery.trim() && filteredComments.length === 0 ? (
        <p className="search-empty-hint muted">No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
      ) : (
        <>
          <ul>
            {pageItems.map((comment) => (
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
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            label="Comments"
            onPageChange={setListPage}
          />
        </>
      )}
      <label className="field-label">
        Add comment
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share feedback or @AgentName for follow-up"
          rows={3}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={saving || !draft.trim()}>
        {saving ? "Posting..." : "Post comment"}
      </button>
    </section>
  );
}