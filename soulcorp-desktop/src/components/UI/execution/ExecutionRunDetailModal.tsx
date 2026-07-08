import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { getWorkspacePage } from "../../../services/workspaceClient";
import type { ExecutionRun, WorkNode, WorkNodeStatus } from "../../../types/game";
import {
  findGlobalTextMatches,
  pageForGlobalMatch,
  sectionMatchSummary,
  type ExecutionTextSection,
} from "../../../utils/multiSectionTextSearch";
import { sectionsNeedSearch } from "../../../utils/pagination";
import { workspacePagePlainText } from "../../../utils/workspacePageText";
import { EXECUTION_TEXT_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import { SearchField } from "../SearchField";
import { SearchableTextSection } from "../SearchableTextSection";

interface ExecutionRunDetailModalProps {
  run: ExecutionRun;
  workNode?: WorkNode | null;
  agentName: string;
  onClose: () => void;
  onOpenWorkspace: (pageId: string, label: string) => void;
  onApprove?: (workNodeId: string) => void;
  approving?: boolean;
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function statusLabel(status: WorkNodeStatus | undefined): string {
  if (!status) {
    return "—";
  }
  return status.replace(/_/g, " ");
}

export function ExecutionRunDetailModal({
  run,
  workNode,
  agentName,
  onClose,
  onOpenWorkspace,
  onApprove,
  approving = false,
}: ExecutionRunDetailModalProps) {
  const [deliverableTitle, setDeliverableTitle] = useState<string | null>(null);
  const [deliverableBody, setDeliverableBody] = useState<string | null>(null);
  const [deliverableLoading, setDeliverableLoading] = useState(false);
  const [deliverableError, setDeliverableError] = useState<string | null>(null);
  const [errorPage, setErrorPage] = useState(0);
  const [summaryPage, setSummaryPage] = useState(0);
  const [deliverablePage, setDeliverablePage] = useState(0);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalSearchType, setGlobalSearchType] = useState(SEARCH_TYPE_ALL);
  const [globalMatchIndex, setGlobalMatchIndex] = useState(0);
  const debouncedGlobalQuery = useDebouncedValue(globalQuery);

  const searchableSections = useMemo((): ExecutionTextSection[] => {
    const sections: ExecutionTextSection[] = [];
    if (run.error) {
      sections.push({ id: "error", label: "Error", text: run.error });
    }
    if (run.summary) {
      sections.push({ id: "summary", label: "Summary", text: run.summary });
    }
    if (deliverableBody) {
      sections.push({ id: "deliverable", label: "Deliverable", text: deliverableBody });
    }
    return sections;
  }, [run.error, run.summary, deliverableBody]);

  const scopedSearchableSections = useMemo(() => {
    if (globalSearchType === SEARCH_TYPE_ALL) {
      return searchableSections;
    }
    const sectionId =
      globalSearchType === "output" ? "deliverable" : globalSearchType;
    return searchableSections.filter((section) => section.id === sectionId);
  }, [searchableSections, globalSearchType]);

  const globalMatches = useMemo(
    () => findGlobalTextMatches(scopedSearchableSections, debouncedGlobalQuery),
    [scopedSearchableSections, debouncedGlobalQuery],
  );

  const matchSummary = useMemo(
    () => sectionMatchSummary(scopedSearchableSections, debouncedGlobalQuery),
    [scopedSearchableSections, debouncedGlobalQuery],
  );

  const activeGlobalMatch = globalMatches[globalMatchIndex] ?? null;

  const sectionActiveMatchIndex = (sectionId: ExecutionTextSection["id"]): number | null => {
    if (!activeGlobalMatch || activeGlobalMatch.sectionId !== sectionId) {
      return null;
    }
    return activeGlobalMatch.sectionMatchIndex;
  };

  useEffect(() => {
    setErrorPage(0);
    setSummaryPage(0);
    setDeliverablePage(0);
    setGlobalQuery("");
    setGlobalSearchType(SEARCH_TYPE_ALL);
    setGlobalMatchIndex(0);
  }, [run.id]);

  useEffect(() => {
    setGlobalMatchIndex(0);
  }, [debouncedGlobalQuery, globalSearchType]);

  useEffect(() => {
    if (!activeGlobalMatch || !debouncedGlobalQuery.trim()) {
      return;
    }
    const page = pageForGlobalMatch(
      scopedSearchableSections,
      debouncedGlobalQuery,
      activeGlobalMatch,
    );
    if (activeGlobalMatch.sectionId === "error") {
      setErrorPage(page);
    } else if (activeGlobalMatch.sectionId === "summary") {
      setSummaryPage(page);
    } else {
      setDeliverablePage(page);
    }
    document
      .getElementById(`execution-section-${activeGlobalMatch.sectionId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [
    activeGlobalMatch?.globalIndex,
    activeGlobalMatch?.sectionId,
    debouncedGlobalQuery,
    scopedSearchableSections,
  ]);

  useEffect(() => {
    if (!run.deliverable_page_id) {
      setDeliverableTitle(null);
      setDeliverableBody(null);
      setDeliverableError(null);
      setDeliverablePage(0);
      return;
    }

    let cancelled = false;
    setDeliverableLoading(true);
    setDeliverableError(null);
    setDeliverablePage(0);

    void getWorkspacePage(run.deliverable_page_id)
      .then((page) => {
        if (cancelled) {
          return;
        }
        setDeliverableTitle(page.title);
        setDeliverableBody(workspacePagePlainText(page));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setDeliverableTitle(null);
        setDeliverableBody(null);
        setDeliverableError(String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setDeliverableLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [run.deliverable_page_id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const goToGlobalMatch = (direction: 1 | -1) => {
    if (globalMatches.length === 0) {
      return;
    }
    setGlobalMatchIndex((current) =>
      direction === 1
        ? (current + 1) % globalMatches.length
        : (current - 1 + globalMatches.length) % globalMatches.length,
    );
  };

  const handleGlobalSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToGlobalMatch(event.shiftKey ? -1 : 1);
    }
  };

  const taskTitle = workNode?.title ?? run.work_node_id;
  const canApprove = workNode?.status === "in_review" && Boolean(onApprove);
  const showRunSearch = sectionsNeedSearch(searchableSections);
  const usingGlobalSearch = showRunSearch && debouncedGlobalQuery.trim().length > 0;

  useEffect(() => {
    if (!showRunSearch) {
      setGlobalQuery("");
      setGlobalMatchIndex(0);
    }
  }, [showRunSearch, run.id]);

  return (
    <div
      className="execution-run-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="execution-run-detail-title"
      onClick={onClose}
    >
      <div className="execution-run-modal" onClick={(event) => event.stopPropagation()}>
        <header className="execution-run-modal-header">
          <div>
            <p className="execution-run-modal-eyebrow">Execution run</p>
            <h2 id="execution-run-detail-title">{taskTitle}</h2>
            <p className="muted">
              {run.status} · {agentName} · {run.provider || "runtime"}
            </p>
          </div>
          <button type="button" className="execution-run-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {showRunSearch ? (
          <div className="execution-run-global-search">
            <SearchField
              value={globalQuery}
              onChange={setGlobalQuery}
              placeholder="Search error, summary, and deliverable…"
              ariaLabel="Search entire execution run"
              matchCount={
                usingGlobalSearch || globalSearchType !== SEARCH_TYPE_ALL
                  ? globalMatches.length
                  : undefined
              }
              onKeyDown={handleGlobalSearchKeyDown}
              typeFilter={{
                value: globalSearchType,
                onChange: setGlobalSearchType,
                options: EXECUTION_TEXT_SEARCH_TYPES,
                ariaLabel: "Filter execution run search section",
                label: "Section",
              }}
            />
            {usingGlobalSearch && matchSummary.length > 0 ? (
              <p className="execution-run-global-search-summary muted">
                {matchSummary.map((entry) => `${entry.label} · ${entry.count}`).join(" · ")}
                {globalMatches.length > 1
                  ? ` · match ${globalMatchIndex + 1}/${globalMatches.length}`
                  : ""}
              </p>
            ) : null}
            {usingGlobalSearch && globalMatches.length > 1 ? (
              <div className="searchable-text-match-nav">
                <button type="button" onClick={() => goToGlobalMatch(-1)}>
                  Prev match
                </button>
                <button type="button" onClick={() => goToGlobalMatch(1)}>
                  Next match
                </button>
              </div>
            ) : null}
            {usingGlobalSearch && globalMatches.length === 0 ? (
              <p className="search-empty-hint muted">
                No matches for &ldquo;{debouncedGlobalQuery}&rdquo;.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="execution-run-modal-body">
          <section className="execution-run-meta-grid" aria-label="Run metadata">
            <div>
              <span className="execution-run-meta-label">Run ID</span>
              <code>{run.id}</code>
            </div>
            <div>
              <span className="execution-run-meta-label">Work node</span>
              <code>{run.work_node_id}</code>
            </div>
            <div>
              <span className="execution-run-meta-label">Agent</span>
              <span>{agentName}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">Status</span>
              <span className={`execution-run-status execution-run-status--${run.status}`}>
                {run.status}
              </span>
            </div>
            <div>
              <span className="execution-run-meta-label">Provider</span>
              <span>{run.provider || "—"}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">Tokens</span>
              <span>
                {run.actual_tokens || run.estimated_tokens} used
                {run.estimated_tokens ? ` · est. ${run.estimated_tokens}` : ""}
              </span>
            </div>
            <div>
              <span className="execution-run-meta-label">Started</span>
              <span>{formatTimestamp(run.started_at)}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">Finished</span>
              <span>{formatTimestamp(run.finished_at)}</span>
            </div>
            {workNode ? (
              <div>
                <span className="execution-run-meta-label">Task status</span>
                <span>{statusLabel(workNode.status)}</span>
              </div>
            ) : null}
          </section>

          {run.error ? (
            <SearchableTextSection
              sectionId="execution-section-error"
              title="Error"
              text={run.error}
              page={errorPage}
              onPageChange={setErrorPage}
              label="Error"
              variant="error"
              query={usingGlobalSearch ? globalQuery : undefined}
              onQueryChange={usingGlobalSearch ? setGlobalQuery : undefined}
              showSearchToolbar={false}
              activeMatchIndex={sectionActiveMatchIndex("error")}
            />
          ) : null}

          {run.summary ? (
            <SearchableTextSection
              sectionId="execution-section-summary"
              title="Run summary"
              text={run.summary}
              page={summaryPage}
              onPageChange={setSummaryPage}
              label="Summary"
              query={usingGlobalSearch ? globalQuery : undefined}
              onQueryChange={usingGlobalSearch ? setGlobalQuery : undefined}
              showSearchToolbar={false}
              activeMatchIndex={sectionActiveMatchIndex("summary")}
            />
          ) : null}

          <section className="execution-run-section" id="execution-section-deliverable">
            <div className="execution-run-section-header">
              <h3>Deliverable</h3>
              {run.deliverable_page_id ? (
                <button
                  type="button"
                  className="execution-run-link-btn"
                  onClick={() =>
                    onOpenWorkspace(
                      run.deliverable_page_id!,
                      deliverableTitle || run.summary || taskTitle,
                    )
                  }
                >
                  Open in Workspace
                </button>
              ) : null}
            </div>
            {deliverableLoading ? <p className="muted">Loading full deliverable…</p> : null}
            {deliverableError ? <p className="execution-run-error">{deliverableError}</p> : null}
            {!deliverableLoading && !deliverableError && deliverableBody ? (
              <>
                {deliverableTitle ? (
                  <p className="execution-run-deliverable-title">{deliverableTitle}</p>
                ) : null}
                <SearchableTextSection
                  title=""
                  text={deliverableBody}
                  page={deliverablePage}
                  onPageChange={setDeliverablePage}
                  label="Deliverable"
                  variant="deliverable"
                  query={usingGlobalSearch ? globalQuery : undefined}
                  onQueryChange={usingGlobalSearch ? setGlobalQuery : undefined}
                  showSearchToolbar={false}
                  activeMatchIndex={sectionActiveMatchIndex("deliverable")}
                />
              </>
            ) : null}
            {!deliverableLoading && !deliverableError && !deliverableBody && !run.deliverable_page_id ? (
              <p className="muted">No deliverable page was created for this run.</p>
            ) : null}
          </section>
        </div>

        <footer className="execution-run-modal-footer">
          {canApprove ? (
            <button
              type="button"
              className="execution-run-primary-btn"
              disabled={approving}
              onClick={() => onApprove?.(run.work_node_id)}
            >
              {approving ? "Approving…" : "Approve deliverable"}
            </button>
          ) : null}
          <button type="button" className="execution-run-secondary-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}