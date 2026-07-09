import { useMemo, useState } from "react";
import { useAutopilotSnapshot } from "../../../hooks/useAutopilotSnapshot";
import { useGameStore } from "../../../stores/gameStore";
import { notifyScrumChanged } from "../../../utils/scrumSync";
import { openWorkspacePage } from "../../../utils/openWorkspacePage";
import { formatTimestamp } from "../../../utils/formatTimestamp";
import {
  ceoApproveDeliverable,
  ceoApproveDirective,
  ceoCommentOnItem,
  ceoEditDirective,
  ceoRejectDeliverable,
  ceoRejectDirective,
  ceoRerouteStory,
  ceoUpdateStoryCriteria,
  dismissMeetingGate,
  meetingFollowUpDirective,
  pauseAutopilot,
  resumeAutopilot,
  setAutopilotInterventionMode,
  setFullAutopilot,
  type AutopilotInterventionMode,
  type PendingGate,
} from "../../../services/autopilotClient";

interface AutopilotPipelinePanelProps {
  onJumpToSection?: (sectionId: string) => void;
}

function gateKindLabel(kind: PendingGate["kind"]): string {
  switch (kind) {
    case "directive":
      return "Directive";
    case "deliverable":
      return "Deliverable";
    case "meeting_summary":
      return "Meeting";
    case "story_brief":
      return "Brief";
    default:
      return kind;
  }
}

export function AutopilotPipelinePanel({ onJumpToSection }: AutopilotPipelinePanelProps) {
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);
  const { snapshot, loading, refresh } = useAutopilotSnapshot();
  const [busy, setBusy] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState("");
  const [editTitleDraft, setEditTitleDraft] = useState("");
  const [editDescDraft, setEditDescDraft] = useState("");
  const [criteriaDraft, setCriteriaDraft] = useState("");
  const [drawerMode, setDrawerMode] = useState<
    "comment" | "edit_directive" | "edit_criteria" | "reject"
  >("comment");

  const selectedGate = useMemo(
    () => snapshot?.pending_gates.find((g) => g.id === selectedGateId) ?? null,
    [snapshot, selectedGateId],
  );

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      setStatusMessage(success);
      await refresh();
      notifyScrumChanged();
    } catch (err) {
      setStatusMessage(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInterventionMode = async (mode: AutopilotInterventionMode) => {
    await run(async () => {
      await setAutopilotInterventionMode(mode);
      setSettings({
        ...settings,
        autopilot_intervention_mode: mode,
        scrum_execution_paused: mode === "paused",
      });
    }, `Intervention mode: ${mode}`);
  };

  const handleFullAutopilot = async (enabled: boolean) => {
    await run(async () => {
      await setFullAutopilot(enabled);
      setSettings({
        ...settings,
        autopilot_full_auto_enabled: enabled,
        scrum_worker_enabled: enabled ? true : settings.scrum_worker_enabled,
        orchestrator_enabled: enabled ? true : settings.orchestrator_enabled,
        scrum_auto_route: enabled ? true : settings.scrum_auto_route,
        scrum_auto_schedule: enabled ? true : settings.scrum_auto_schedule,
        scrum_auto_execute: enabled ? true : settings.scrum_auto_execute,
        scrum_auto_approve: enabled ? true : settings.scrum_auto_approve,
        scrum_execution_paused: enabled ? false : settings.scrum_execution_paused,
      });
    }, enabled ? "Full Autopilot enabled." : "Full Autopilot disabled.");
  };

  const handleGateAction = async (
    gate: PendingGate,
    action: "approve" | "reject" | "comment" | "dismiss" | "open",
  ) => {
    if (action === "open" && gate.workspace_page_id) {
      void openWorkspacePage(gate.workspace_page_id, gate.title);
      return;
    }
    if (action === "comment") {
      if (!commentDraft.trim()) return;
      const kind = gate.kind === "deliverable" ? "work_node" : gate.kind === "directive" ? "directive" : gate.kind;
      const id =
        gate.directive_id ?? gate.work_node_id ?? gate.meeting_id ?? gate.id;
      await run(
        () => ceoCommentOnItem(kind, id, commentDraft.trim()),
        "Comment saved.",
      );
      setCommentDraft("");
      return;
    }
    if (gate.kind === "directive" && gate.directive_id) {
      if (action === "approve") {
        await run(() => ceoApproveDirective(gate.directive_id!), "Directive approved — routing next tick.");
      } else if (action === "reject") {
        await run(
          () => ceoRejectDirective(gate.directive_id!, rejectDraft),
          "Directive rejected.",
        );
        setRejectDraft("");
      }
      return;
    }
    if (gate.kind === "deliverable" && gate.work_node_id) {
      if (action === "approve") {
        await run(() => ceoApproveDeliverable(gate.work_node_id!), "Deliverable approved.");
      } else if (action === "reject") {
        await run(
          () => ceoRejectDeliverable(gate.work_node_id!, rejectDraft),
          "Deliverable rejected — revision task queued.",
        );
        setRejectDraft("");
      } else if (action === "open" && gate.workspace_page_id) {
        void openWorkspacePage(gate.workspace_page_id, gate.title);
      }
      return;
    }
    if (gate.kind === "meeting_summary" && gate.meeting_id && action === "dismiss") {
      await run(() => dismissMeetingGate(gate.meeting_id!), "Meeting summary dismissed.");
    }
  };

  if (!snapshot && loading) {
    return <p className="muted">Loading autopilot status…</p>;
  }

  if (!snapshot) {
    return <p className="muted">Complete onboarding to start Company Autopilot.</p>;
  }

  return (
    <div className="autopilot-panel">
      <div className="autopilot-controls">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.autopilot_full_auto_enabled ?? true}
            disabled={busy}
            onChange={(e) => void handleFullAutopilot(e.target.checked)}
          />
          <span>Full Autopilot (all scrum_auto_* policies)</span>
        </label>
        <label className="field-label">
          Intervention mode
          <select
            value={snapshot.intervention_mode}
            disabled={busy}
            onChange={(e) =>
              void handleInterventionMode(e.target.value as AutopilotInterventionMode)
            }
          >
            <option value="auto">Auto — intervene anytime</option>
            <option value="gate_directives">Gate directives</option>
            <option value="gate_deliverables">Gate deliverables</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        {snapshot.execution_paused ? (
          <button type="button" className="primary-action" disabled={busy} onClick={() => void run(resumeAutopilot, "Autopilot resumed.")}>
            Resume autopilot
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void run(pauseAutopilot, "Autopilot paused.")}>
            Pause autopilot
          </button>
        )}
      </div>

      <div className="autopilot-live">
        <div className="autopilot-phase-pill">
          <span className="autopilot-phase-label">Phase</span>
          <strong>{snapshot.phase_label}</strong>
          {snapshot.stall_reason ? (
            <span className="autopilot-stall-reason">{snapshot.stall_reason}</span>
          ) : null}
        </div>
        <p className="muted autopilot-next-action">{snapshot.next_action}</p>
        <div className="autopilot-metrics">
          <span>{snapshot.counts.active_agents} agent(s) live</span>
          <span>{snapshot.counts.in_progress_tasks} in progress</span>
          <span>{snapshot.deliverables_this_week} delivered this week</span>
          {snapshot.gigs_advanced_this_week > 0 ? (
            <span>{snapshot.gigs_advanced_this_week} gig(s) advanced</span>
          ) : null}
        </div>
      </div>

      <div className="autopilot-pipeline" aria-label="Autopilot pipeline">
        {snapshot.pipeline_steps.map((step) => (
          <button
            key={step.phase}
            type="button"
            className={`autopilot-pipeline-step${step.active ? " is-active" : ""}`}
            onClick={() => onJumpToSection?.(step.phase === "reviewing" ? "backlog" : "command")}
          >
            <span className="autopilot-step-label">{step.label}</span>
            <span className="autopilot-step-count">{step.count}</span>
          </button>
        ))}
      </div>

      <section className="autopilot-needs-input">
        <h4>Needs your input</h4>
        {snapshot.pending_gates.length === 0 ? (
          <p className="muted">Nothing waiting — autopilot is running.</p>
        ) : (
          <ul className="autopilot-gate-list">
            {snapshot.pending_gates.map((gate) => (
              <li key={gate.id} className="autopilot-gate-item">
                <div className="autopilot-gate-head">
                  <span className="autopilot-gate-kind">{gateKindLabel(gate.kind)}</span>
                  <strong>{gate.title}</strong>
                  <span className="muted">{formatTimestamp(gate.created_at)}</span>
                </div>
                <p className="muted autopilot-gate-detail">{gate.detail}</p>
                <div className="autopilot-gate-actions">
                  {gate.kind === "directive" ? (
                    <>
                      <button type="button" className="primary-action" disabled={busy} onClick={() => void handleGateAction(gate, "approve")}>
                        Approve &amp; route
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedGateId(gate.id);
                          setDrawerMode("edit_directive");
                          setEditTitleDraft(gate.title);
                          setEditDescDraft(gate.detail);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedGateId(gate.id);
                          setDrawerMode("reject");
                          setRejectDraft("");
                        }}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {gate.kind === "deliverable" ? (
                    <>
                      <button type="button" className="primary-action" disabled={busy} onClick={() => void handleGateAction(gate, "approve")}>
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedGateId(gate.id);
                          setDrawerMode("reject");
                          setRejectDraft("");
                        }}
                      >
                        Reject
                      </button>
                      {gate.workspace_page_id ? (
                        <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "open")}>
                          Open deliverable
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {gate.kind === "meeting_summary" ? (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        disabled={busy}
                        onClick={() =>
                          gate.meeting_id
                            ? void run(
                                () => meetingFollowUpDirective(gate.meeting_id!),
                                "Follow-up directive issued.",
                              )
                            : undefined
                        }
                      >
                        Add follow-up directive
                      </button>
                      <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "dismiss")}>
                        Dismiss
                      </button>
                    </>
                  ) : null}
                  {gate.kind === "story_brief" && gate.work_node_id ? (
                    <>
                      {gate.workspace_page_id ? (
                        <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "open")}>
                          Open in Workspace
                        </button>
                      ) : (
                        <span className="muted">Autopilot preparing brief…</span>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedGateId(gate.id);
                          setDrawerMode("edit_criteria");
                          setCriteriaDraft("- Criterion 1\n- Criterion 2");
                        }}
                      >
                        Edit criteria
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          gate.work_node_id
                            ? void run(
                                () => ceoRerouteStory(gate.work_node_id!),
                                "Story queued for re-route.",
                              )
                            : undefined
                        }
                      >
                        Reject &amp; re-route
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedGateId(gate.id);
                      setDrawerMode("comment");
                      setCommentDraft("");
                    }}
                  >
                    Comment
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedGate ? (
        <div className="autopilot-intervention-drawer">
          <h5>
            {drawerMode === "comment"
              ? "Comment"
              : drawerMode === "edit_directive"
                ? "Edit directive"
                : drawerMode === "edit_criteria"
                  ? "Edit acceptance criteria"
                  : "Reject"}
            {" · "}
            {selectedGate.title}
          </h5>

          {drawerMode === "comment" ? (
            <textarea
              className="autopilot-comment-box"
              rows={3}
              placeholder="CEO comment…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
          ) : null}

          {drawerMode === "edit_directive" ? (
            <div className="autopilot-drawer-fields">
              <label className="field-label">
                Title
                <input
                  type="text"
                  value={editTitleDraft}
                  onChange={(e) => setEditTitleDraft(e.target.value)}
                />
              </label>
              <label className="field-label">
                Description
                <textarea
                  className="autopilot-comment-box"
                  rows={4}
                  value={editDescDraft}
                  onChange={(e) => setEditDescDraft(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          {drawerMode === "edit_criteria" ? (
            <textarea
              className="autopilot-comment-box"
              rows={5}
              placeholder="- Criterion 1&#10;- Criterion 2&#10;- Criterion 3"
              value={criteriaDraft}
              onChange={(e) => setCriteriaDraft(e.target.value)}
            />
          ) : null}

          {drawerMode === "reject" ? (
            <textarea
              className="autopilot-comment-box"
              rows={3}
              placeholder="Rejection reason (optional)…"
              value={rejectDraft}
              onChange={(e) => setRejectDraft(e.target.value)}
            />
          ) : null}

          <div className="autopilot-drawer-actions">
            {drawerMode === "comment" ? (
              <button
                type="button"
                className="primary-action"
                disabled={busy || !commentDraft.trim()}
                onClick={() => void handleGateAction(selectedGate, "comment")}
              >
                Save comment
              </button>
            ) : null}
            {drawerMode === "edit_directive" && selectedGate.directive_id ? (
              <button
                type="button"
                className="primary-action"
                disabled={busy || !editTitleDraft.trim()}
                onClick={() =>
                  void run(async () => {
                    await ceoEditDirective(
                      selectedGate.directive_id!,
                      editTitleDraft.trim(),
                      editDescDraft.trim(),
                    );
                    setSelectedGateId(null);
                  }, "Directive updated.")
                }
              >
                Save edits
              </button>
            ) : null}
            {drawerMode === "edit_criteria" && selectedGate.work_node_id ? (
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={() => {
                  const criteria = criteriaDraft
                    .split("\n")
                    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
                    .filter(Boolean);
                  void run(async () => {
                    await ceoUpdateStoryCriteria(selectedGate.work_node_id!, criteria);
                    setSelectedGateId(null);
                  }, "Acceptance criteria updated.");
                }}
              >
                Save criteria
              </button>
            ) : null}
            {drawerMode === "reject" ? (
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={() => {
                  void handleGateAction(selectedGate, "reject").then(() => {
                    setSelectedGateId(null);
                  });
                }}
              >
                Confirm reject
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setSelectedGateId(null);
                setDrawerMode("comment");
                setCommentDraft("");
                setRejectDraft("");
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {snapshot.recent_interventions.length > 0 ? (
        <section className="autopilot-interventions-log">
          <h5>Recent interventions</h5>
          <ul>
            {snapshot.recent_interventions.slice().reverse().slice(0, 8).map((item) => (
              <li key={item.id}>
                <strong>{item.action}</strong> {item.item_kind} · {formatTimestamp(item.timestamp)}
                {item.comment ? <span className="muted"> — {item.comment}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}