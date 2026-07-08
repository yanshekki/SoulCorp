import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import type { ExecutionRun, WorkNode } from "../../../types/game";
import { filterByQuery } from "../../../utils/listSearch";
import { EXECUTION_LOG_PAGE_SIZE, paginateItems } from "../../../utils/pagination";
import { openWorkspacePage } from "../../../utils/openWorkspacePage";
import { PaginationBar } from "../PaginationBar";
import { SearchableListToolbar } from "../SearchableListToolbar";
import { ExecutionRunDetailModal } from "./ExecutionRunDetailModal";

interface ExecutionLogSectionProps {
  runs: ExecutionRun[];
  workNodes: WorkNode[];
  agentLabels: Map<string, string>;
  onApprove: (workNodeId: string) => Promise<void>;
}

function formatRunWhen(run: ExecutionRun): string {
  const raw = run.finished_at || run.started_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}

export function ExecutionLogSection({
  runs,
  workNodes,
  agentLabels,
  onApprove,
}: ExecutionLogSectionProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery);

  const workNodeById = useMemo(() => {
    const map = new Map<string, WorkNode>();
    for (const node of workNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [workNodes]);

  const orderedRuns = useMemo(
    () => [...runs].sort((left, right) => right.started_at.localeCompare(left.started_at)),
    [runs],
  );

  const filteredRuns = useMemo(
    () =>
      filterByQuery(orderedRuns, debouncedQuery, (run) => {
        const workNode = workNodeById.get(run.work_node_id);
        const agentName = agentLabels.get(run.agent_id) ?? run.agent_id;
        return [
          workNode?.title ?? "",
          run.work_node_id,
          run.status,
          agentName,
          run.agent_id,
          run.summary ?? "",
          run.error ?? "",
          run.id,
          run.provider ?? "",
        ];
      }),
    [orderedRuns, debouncedQuery, workNodeById, agentLabels],
  );

  const { pageItems, totalPages, safePage } = useMemo(
    () => paginateItems(filteredRuns, listPage, EXECUTION_LOG_PAGE_SIZE),
    [filteredRuns, listPage],
  );

  useEffect(() => {
    setListPage(0);
  }, [runs.length, debouncedQuery]);

  useEffect(() => {
    if (listPage !== safePage) {
      setListPage(safePage);
    }
  }, [listPage, safePage]);

  const selectedRun = selectedRunId
    ? filteredRuns.find((run) => run.id === selectedRunId) ?? null
    : null;

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    const visible = pageItems.some((run) => run.id === selectedRunId);
    if (!visible) {
      setSelectedRunId(null);
    }
  }, [pageItems, selectedRunId]);

  const handleApprove = async (workNodeId: string) => {
    setApproving(true);
    try {
      await onApprove(workNodeId);
    } finally {
      setApproving(false);
    }
  };

  return (
    <section id="execution" className="projects-card" data-projects-section="execution">
      <header className="projects-card-header">
        <p className="workflow-step-badge">5 · Execute</p>
        <h3>Execution Log</h3>
        <p className="muted">
          {orderedRuns.length} run{orderedRuns.length === 1 ? "" : "s"} total — click a run to view
          full output page by page, then approve and open in Workspace.
        </p>
      </header>
      <div className="projects-card-body">
        {orderedRuns.length > 0 ? (
          <SearchableListToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Search runs by task, agent, status…"
            ariaLabel="Search execution runs"
            matchCount={debouncedQuery.trim() ? filteredRuns.length : undefined}
            totalCount={orderedRuns.length}
          />
        ) : null}
        {orderedRuns.length === 0 ? <p className="muted">No executions yet.</p> : null}
        {orderedRuns.length > 0 && debouncedQuery.trim() && filteredRuns.length === 0 ? (
          <p className="search-empty-hint muted">No matches for &ldquo;{debouncedQuery}&rdquo;.</p>
        ) : null}
        <ul className="projects-execution-list">
          {pageItems.map((run) => {
            const workNode = workNodeById.get(run.work_node_id);
            const agentName = agentLabels.get(run.agent_id) ?? run.agent_id;
            const title = workNode?.title ?? run.work_node_id;
            const preview = run.summary || run.error || "No summary recorded.";
            return (
              <li key={run.id}>
                <button
                  type="button"
                  className="projects-execution-item"
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className="projects-execution-item-head">
                    <span className={`execution-run-status execution-run-status--${run.status}`}>
                      {run.status}
                    </span>
                    <strong>{title}</strong>
                    <span className="muted">
                      {agentName} · ~{run.actual_tokens || run.estimated_tokens} tokens
                    </span>
                  </div>
                  <p className="projects-execution-preview muted">{preview}</p>
                  <span className="projects-execution-meta muted">{formatRunWhen(run)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <PaginationBar
          className="projects-execution-pagination"
          page={safePage}
          totalPages={totalPages}
          label="Runs"
          onPageChange={setListPage}
        />
      </div>

      {selectedRun ? (
        <ExecutionRunDetailModal
          run={selectedRun}
          workNode={workNodeById.get(selectedRun.work_node_id)}
          agentName={agentLabels.get(selectedRun.agent_id) ?? selectedRun.agent_id}
          approving={approving}
          onClose={() => setSelectedRunId(null)}
          onOpenWorkspace={(pageId, label) => {
            void openWorkspacePage(pageId, label);
            setSelectedRunId(null);
          }}
          onApprove={(workNodeId) => handleApprove(workNodeId)}
        />
      ) : null}
    </section>
  );
}