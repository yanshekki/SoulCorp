import { useEffect, useState } from "react";
import { getWorkspacePage } from "../../../services/workspaceClient";
import type { ExecutionRun, WorkNode, WorkNodeStatus } from "../../../types/game";
import { workspacePagePlainText } from "../../../utils/workspacePageText";
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

  useEffect(() => {
    setErrorPage(0);
    setSummaryPage(0);
    setDeliverablePage(0);
  }, [run.id]);

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

  const taskTitle = workNode?.title ?? run.work_node_id;
  const canApprove = workNode?.status === "in_review" && Boolean(onApprove);

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
              title="Error"
              text={run.error}
              page={errorPage}
              onPageChange={setErrorPage}
              label="Error"
              variant="error"
            />
          ) : null}

          {run.summary ? (
            <SearchableTextSection
              title="Run summary"
              text={run.summary}
              page={summaryPage}
              onPageChange={setSummaryPage}
              label="Summary"
            />
          ) : null}

          <section className="execution-run-section">
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