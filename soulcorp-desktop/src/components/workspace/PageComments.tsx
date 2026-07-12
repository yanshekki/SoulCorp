import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { PageComment } from "../../types/workspace";
import { COMMENT_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { PaginationBar } from "../UI/PaginationBar";
import { SearchableListToolbar } from "../UI/SearchableListToolbar";
import { useI18n } from "../../i18n/I18nProvider";

const COMMENT_PAGE_SIZE = 15;

interface PageCommentsProps {
  pageId: string;
}

export function PageComments({ pageId }: PageCommentsProps) {
  const { t } = useI18n();
  const [comments, setComments] = useState<PageComment[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(SEARCH_TYPE_ALL);
  const [listPage, setListPage] = useState(0);
  const debouncedQuery = useDebouncedValue(searchQuery);

  useEffect(() => {
    void invoke<PageComment[]>("list_page_comments", { pageId })
      .then(setComments)
      .catch(() => setComments([]));
    setSearchQuery("");
    setSearchType(SEARCH_TYPE_ALL);
    setListPage(0);
  }, [pageId]);

  const filteredComments = useMemo(
    () =>
      filterByScopedQuery(comments, debouncedQuery, searchType, {
        all: (comment) => [comment.author, comment.content, ...comment.mentions],
        author: (comment) => [comment.author, ...comment.mentions],
        content: (comment) => [comment.content],
      }),
    [comments, debouncedQuery, searchType],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredComments, listPage, COMMENT_PAGE_SIZE),
    [filteredComments, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [debouncedQuery, searchType, comments.length]);

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
      <h3>{t("workspace.comments")}</h3>
      {comments.length > 0 ? (
        <SearchableListToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder={t("workspace.searchComments")}
          ariaLabel={t("workspace.searchCommentsAria")}
          matchCount={
            debouncedQuery.trim() || searchType !== SEARCH_TYPE_ALL
              ? filteredComments.length
              : undefined
          }
          totalCount={comments.length}
          typeFilter={{
            value: searchType,
            onChange: setSearchType,
            options: COMMENT_SEARCH_TYPES,
            ariaLabel: t("workspace.filterFieldAria"),
            label: t("workspace.filterField"),
          }}
        />
      ) : null}
      {comments.length === 0 ? (
        <p className="muted">{t("workspace.noComments")}</p>
      ) : debouncedQuery.trim() && filteredComments.length === 0 ? (
        <p className="search-empty-hint muted">{t("workspace.noMatches", { query: debouncedQuery })}</p>
      ) : (
        <>
          <ul>
            {pageItems.map((comment) => (
              <li key={comment.id}>
                <strong>{comment.author}</strong>
                <span className="muted"> · {new Date(comment.created_at).toLocaleString()}</span>
                <p>{comment.content}</p>
                {comment.mentions.length > 0 ? (
                  <p className="muted">{t("workspace.mentions", { list: comment.mentions.map((m) => `@${m}`).join(", ") })}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            label={t("workspace.comments")}
            onPageChange={setListPage}
          />
        </>
      )}
      <label className="field-label">
        {t("workspace.addComment")}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("workspace.commentPlaceholder")}
          rows={3}
        />
      </label>
      <button type="button" onClick={() => void submit()} disabled={saving || !draft.trim()}>
        {saving ? t("workspace.posting") : t("workspace.postComment")}
      </button>
    </section>
  );
}