import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { getWorkspacePage } from "../../../services/workspaceClient";
import type {
  ExecutionCliView,
  ExecutionRun,
  ExecutionWorkspaceInfo,
  WorkNode,
} from "../../../types/game";
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
import { useI18n } from "../../../i18n/I18nProvider";
import { cleanDisplayTitle, CliInputModal } from "./CliInputModal";

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



export function ExecutionRunDetailModal({
  run,
  workNode,
  agentName,
  onClose,
  onOpenWorkspace,
  onApprove,
  approving = false,
}: ExecutionRunDetailModalProps) {
  const { t } = useI18n();
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
  const [showCliInput, setShowCliInput] = useState(false);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliView, setCliView] = useState<{
    command: string | null;
    prompt: string;
    promptPath: string | null;
    workspace: ExecutionWorkspaceInfo | null;
  } | null>(null);
  const debouncedGlobalQuery = useDebouncedValue(globalQuery);

  const openCliInput = async () => {
    setCliLoading(true);
    try {
      const view = await invoke<ExecutionCliView>("get_execution_cli_input", {
        runId: run.id,
      });
      setCliView({
        command: view.command,
        prompt: view.prompt,
        promptPath: view.prompt_path ?? null,
        workspace: view.workspace ?? null,
      });
      setShowCliInput(true);
    } catch {
      // Fall back to whatever was stored on the run (may be stale pre-fix format).
      setCliView({
        command: run.cli_command ?? null,
        prompt: run.cli_input ?? "",
        promptPath: run.cli_prompt_path ?? null,
        workspace: run.workspace_info ?? null,
      });
      setShowCliInput(true);
    } finally {
      setCliLoading(false);
    }
  };

  const searchableSections = useMemo((): ExecutionTextSection[] => {
    const sections: ExecutionTextSection[] = [];
    if (run.error) {
      sections.push({ id: "error", label: t("common.error"), text: run.error });
    }
    if (run.summary) {
      sections.push({ id: "summary", label: t("execution.summary"), text: run.summary });
    }
    if (deliverableBody) {
      sections.push({
        id: "deliverable",
        label: t("execution.deliverable"),
        text: deliverableBody,
      });
    }
    return sections;
  }, [run.error, run.summary, deliverableBody, t]);

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
            <p className="execution-run-modal-eyebrow">{t("execution.runEyebrow")}</p>
            <h2 id="execution-run-detail-title">{taskTitle}</h2>
            <p className="muted">
              {run.status} · {agentName} · {run.provider || "runtime"}
            </p>
          </div>
          <button type="button" className="execution-run-close" onClick={onClose} aria-label={t("common.close")}>
            ×
          </button>
        </header>

        {showRunSearch ? (
          <div className="execution-run-global-search">
            <SearchField
              value={globalQuery}
              onChange={setGlobalQuery}
              placeholder={t("execution.searchPlaceholder")}
              ariaLabel={t("execution.searchAria")}
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
                ariaLabel: t("execution.filterSectionAria"),
                label: t("execution.sectionLabel"),
              }}
            />
            {usingGlobalSearch && matchSummary.length > 0 ? (
              <p className="execution-run-global-search-summary muted">
                {matchSummary.map((entry) => `${entry.label} · ${entry.count}`).join(" · ")}
                {globalMatches.length > 1
                  ? t("execution.matchNav", {
                      current: globalMatchIndex + 1,
                      total: globalMatches.length,
                    })
                  : ""}
              </p>
            ) : null}
            {usingGlobalSearch && globalMatches.length > 1 ? (
              <div className="searchable-text-match-nav">
                <button type="button" onClick={() => goToGlobalMatch(-1)}>
                  {t("execution.prevMatch")}
                </button>
                <button type="button" onClick={() => goToGlobalMatch(1)}>
                  {t("execution.nextMatch")}
                </button>
              </div>
            ) : null}
            {usingGlobalSearch && globalMatches.length === 0 ? (
              <p className="search-empty-hint muted">
                {t("execution.noMatchesQuery", { query: debouncedGlobalQuery })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="execution-run-modal-body">
          <section className="execution-run-meta-grid" aria-label={t("execution.metaAria")}>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.runId")}</span>
              <code>{run.id}</code>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.workNode")}</span>
              <code>{run.work_node_id}</code>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.agent")}</span>
              <span>{agentName}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.status")}</span>
              <span className={`execution-run-status execution-run-status--${run.status}`}>
                {run.status}
              </span>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.provider")}</span>
              <span>{run.provider || "—"}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.tokens")}</span>
              <span>
                {t("execution.meta.tokensUsed", {
                  used: run.actual_tokens || run.estimated_tokens,
                  est: run.estimated_tokens ? ` · est. ${run.estimated_tokens}` : "",
                })}
              </span>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.started")}</span>
              <span>{formatTimestamp(run.started_at)}</span>
            </div>
            <div>
              <span className="execution-run-meta-label">{t("execution.meta.finished")}</span>
              <span>{formatTimestamp(run.finished_at)}</span>
            </div>
            {workNode ? (
              <div>
                <span className="execution-run-meta-label">{t("execution.meta.taskStatus")}</span>
                <span>
                  {t(`status.${workNode.status}`) === `status.${workNode.status}`
                    ? workNode.status.replace(/_/g, " ")
                    : t(`status.${workNode.status}`)}
                </span>
              </div>
            ) : null}
          </section>

          <section className="execution-run-section">
            <div className="execution-run-section-header">
              <h3>{t("cli.sectionHeader")}</h3>
              <button
                type="button"
                className="secondary-action"
                disabled={cliLoading || (!run.cli_input && !run.cli_command)}
                onClick={() => void openCliInput()}
              >
                {cliLoading ? t("cli.loadingCli") : t("cli.viewCliInput")}
              </button>
            </div>
            {run.cli_input || run.cli_command ? (
              <p className="muted">
                {t("cli.hasInput", {
                  detail: run.cli_input
                    ? ` (${run.cli_input.length.toLocaleString()} char)`
                    : "",
                })}
              </p>
            ) : (
              <p className="muted">{t("cli.noInput")}</p>
            )}
          </section>

          {run.error ? (
            <SearchableTextSection
              sectionId="execution-section-error"
              title={t("execution.error")}
              text={run.error}
              page={errorPage}
              onPageChange={setErrorPage}
              label={t("execution.error")}
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
              title={t("execution.summary")}
              text={run.summary}
              page={summaryPage}
              onPageChange={setSummaryPage}
              label={t("execution.summaryLabel")}
              query={usingGlobalSearch ? globalQuery : undefined}
              onQueryChange={usingGlobalSearch ? setGlobalQuery : undefined}
              showSearchToolbar={false}
              activeMatchIndex={sectionActiveMatchIndex("summary")}
            />
          ) : null}

          <section className="execution-run-section" id="execution-section-deliverable">
            <div className="execution-run-section-header">
              <h3>{t("execution.deliverable")}</h3>
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
                  {t("execution.openWorkspace")}
                </button>
              ) : null}
            </div>
            {deliverableLoading ? <p className="muted">{t("execution.loadingDeliverable")}</p> : null}
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
                  label={t("execution.deliverable")}
                  variant="deliverable"
                  query={usingGlobalSearch ? globalQuery : undefined}
                  onQueryChange={usingGlobalSearch ? setGlobalQuery : undefined}
                  showSearchToolbar={false}
                  activeMatchIndex={sectionActiveMatchIndex("deliverable")}
                />
              </>
            ) : null}
            {!deliverableLoading && !deliverableError && !deliverableBody && !run.deliverable_page_id ? (
              <p className="muted">{t("execution.noDeliverable")}</p>
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
              {approving ? t("execution.approving") : t("execution.approve")}
            </button>
          ) : null}
          <button type="button" className="execution-run-secondary-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </footer>
      </div>
      {showCliInput && cliView ? (
        <CliInputModal
          title={t("cli.titleWithTask", { task: cleanDisplayTitle(taskTitle) })}
          command={cliView.command}
          prompt={cliView.prompt}
          promptPath={cliView.promptPath}
          workspace={cliView.workspace}
          onClose={() => setShowCliInput(false)}
        />
      ) : null}
    </div>
  );
}