import { useMemo, useState } from "react";
import { useAutopilotSnapshot } from "../../../hooks/useAutopilotSnapshot";
import { useI18n } from "../../../i18n/I18nProvider";
import {
  autopilotNextAction,
  autopilotPhaseLabel,
  autopilotStallReason,
  interventionActionLabel,
  interventionKindLabel,
} from "../../../i18n/autopilotMessages";
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

function gateKindI18nKey(kind: PendingGate["kind"]): string {
  switch (kind) {
    case "directive":
      return "autopilot.gate.directive";
    case "deliverable":
      return "autopilot.gate.deliverable";
    case "meeting_summary":
      return "autopilot.gate.meeting";
    case "story_brief":
      return "autopilot.gate.brief";
    default:
      return kind;
  }
}

export function AutopilotPipelinePanel({ onJumpToSection }: AutopilotPipelinePanelProps) {
  const { t } = useI18n();
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
    // Gate policy only — never used as a pause switch (Pause button owns run/stop).
    const nextMode: AutopilotInterventionMode =
      mode === "paused" ? "auto" : mode;
    await run(async () => {
      await setAutopilotInterventionMode(nextMode);
      const latest = useGameStore.getState().settings;
      setSettings({
        ...latest,
        autopilot_intervention_mode: nextMode,
      });
    }, `Intervention mode: ${nextMode}`);
  };

  const handlePauseToggle = async () => {
    const pausing = !snapshot?.execution_paused;
    await run(async () => {
      if (pausing) {
        await pauseAutopilot();
        const latest = useGameStore.getState().settings;
        setSettings({
          ...latest,
          scrum_execution_paused: true,
        });
      } else {
        await resumeAutopilot();
        const latest = useGameStore.getState().settings;
        setSettings({
          ...latest,
          scrum_execution_paused: false,
          // Clear legacy paused mode if present; keep gate_* modes intact.
          autopilot_intervention_mode:
            latest.autopilot_intervention_mode === "paused"
              ? "auto"
              : (latest.autopilot_intervention_mode ?? "auto"),
        });
      }
    }, pausing ? t("autopilot.msg.paused") : t("autopilot.msg.resumed"));
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
        // Enabling full auto also un-pauses and clears CEO gate modes so PM auto-approve runs.
        scrum_execution_paused: enabled ? false : settings.scrum_execution_paused,
        autopilot_intervention_mode: enabled
          ? "auto"
          : settings.autopilot_intervention_mode,
      });
    }, enabled ? t("autopilot.msg.fullOn") : t("autopilot.msg.fullOff"));
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
        t("autopilot.msg.commentSaved"),
      );
      setCommentDraft("");
      return;
    }
    if (gate.kind === "directive" && gate.directive_id) {
      if (action === "approve") {
        await run(() => ceoApproveDirective(gate.directive_id!), t("autopilot.msg.directiveApproved"));
      } else if (action === "reject") {
        await run(
          () => ceoRejectDirective(gate.directive_id!, rejectDraft),
          t("autopilot.msg.directiveRejected"),
        );
        setRejectDraft("");
      }
      return;
    }
    if (gate.kind === "deliverable" && gate.work_node_id) {
      if (action === "approve") {
        await run(() => ceoApproveDeliverable(gate.work_node_id!), t("autopilot.msg.deliverableApproved"));
      } else if (action === "reject") {
        await run(
          () => ceoRejectDeliverable(gate.work_node_id!, rejectDraft),
          t("autopilot.msg.deliverableRejected"),
        );
        setRejectDraft("");
      } else if (action === "open" && gate.workspace_page_id) {
        void openWorkspacePage(gate.workspace_page_id, gate.title);
      }
      return;
    }
    if (gate.kind === "meeting_summary" && gate.meeting_id && action === "dismiss") {
      await run(() => dismissMeetingGate(gate.meeting_id!), t("autopilot.msg.meetingDismissed"));
    }
  };

  if (!snapshot && loading) {
    return <p className="muted">{t("autopilot.loading")}</p>;
  }

  if (!snapshot) {
    return <p className="muted">{t("autopilot.needOnboarding")}</p>;
  }

  return (
    <div className="autopilot-panel">
      <div className="autopilot-toolbar" role="toolbar" aria-label={t("autopilot.controlsAria")}>
        <label className="autopilot-toolbar-item autopilot-toolbar-check">
          <input
            type="checkbox"
            checked={settings.autopilot_full_auto_enabled ?? true}
            disabled={busy}
            onChange={(e) => void handleFullAutopilot(e.target.checked)}
          />
          <span className="autopilot-toolbar-check-copy">
            <strong>{t("autopilot.fullAuto")}</strong>
            <span className="muted">{t("autopilot.fullAutoSub")}</span>
          </span>
        </label>

        <div className="autopilot-toolbar-item autopilot-toolbar-select">
          <span className="autopilot-toolbar-label" id="autopilot-mode-label">
            {t("autopilot.whenCeoStepsIn")}
          </span>
          <select
            aria-labelledby="autopilot-mode-label"
            value={
              snapshot.intervention_mode === "paused" ? "auto" : snapshot.intervention_mode
            }
            disabled={busy}
            onChange={(e) =>
              void handleInterventionMode(e.target.value as AutopilotInterventionMode)
            }
          >
            <option value="auto">{t("autopilot.mode.auto")}</option>
            <option value="gate_directives">{t("autopilot.mode.gateDirectives")}</option>
            <option value="gate_deliverables">{t("autopilot.mode.gateDeliverables")}</option>
          </select>
        </div>

        <div className="autopilot-toolbar-actions">
          <button
            type="button"
            className={`autopilot-toolbar-btn${snapshot.execution_paused ? " autopilot-toolbar-btn--primary" : " autopilot-toolbar-btn--pause"}`}
            disabled={busy}
            onClick={() => void handlePauseToggle()}
            aria-pressed={snapshot.execution_paused}
            title={
              snapshot.execution_paused
                ? t("autopilot.resume")
                : t("autopilot.pause")
            }
          >
            {snapshot.execution_paused ? t("autopilot.resumeShort") : t("autopilot.pauseShort")}
          </button>
        </div>
      </div>
      {snapshot.execution_paused ? (
        <p className="autopilot-paused-banner" role="status">
          {t("autopilot.pausedBanner")}
        </p>
      ) : null}
      {!snapshot.execution_paused && snapshot.intervention_mode === "gate_deliverables" ? (
        <p className="autopilot-paused-banner autopilot-gate-banner" role="status">
          {t("autopilot.gateDeliverablesBanner")}
        </p>
      ) : null}
      {!snapshot.execution_paused && snapshot.intervention_mode === "gate_directives" ? (
        <p className="autopilot-paused-banner autopilot-gate-banner" role="status">
          {t("autopilot.gateDirectivesBanner")}
        </p>
      ) : null}

      <div className="autopilot-live">
        <div className="autopilot-phase-pill">
          <span className="autopilot-phase-label">{t("autopilot.phase")}</span>
          <strong>{autopilotPhaseLabel(t, snapshot.phase, snapshot.phase_label)}</strong>
          {snapshot.stall_reason ? (
            <span className="autopilot-stall-reason">
              {autopilotStallReason(t, snapshot.stall_reason)}
            </span>
          ) : null}
        </div>
        <p className="muted autopilot-next-action">{autopilotNextAction(t, snapshot.next_action, snapshot.phase)}</p>
        <div className="autopilot-metrics">
          <span>{t("autopilot.agentsLive", { n: snapshot.counts.active_agents })}</span>
          <span>{t("autopilot.inProgress", { n: snapshot.counts.in_progress_tasks })}</span>
          <span>{t("autopilot.deliveredWeek", { n: snapshot.deliverables_this_week })}</span>
          {snapshot.gigs_advanced_this_week > 0 ? (
            <span>{t("autopilot.gigsAdvanced", { n: snapshot.gigs_advanced_this_week })}</span>
          ) : null}
        </div>
      </div>

      <div className="autopilot-pipeline" aria-label={t("autopilot.pipelineAria")}>
        {snapshot.pipeline_steps.map((step) => (
          <button
            key={step.phase}
            type="button"
            className={`autopilot-pipeline-step${step.active ? " is-active" : ""}`}
            onClick={() => onJumpToSection?.(step.phase === "reviewing" ? "backlog" : "command")}
          >
            <span className="autopilot-step-label">{autopilotPhaseLabel(t, step.phase, step.label)}</span>
            <span className="autopilot-step-count">{step.count}</span>
          </button>
        ))}
      </div>

      <section className="autopilot-needs-input">
        <h4>{t("autopilot.needsInput")}</h4>
        {snapshot.pending_gates.length === 0 ? (
          <p className="muted">{t("autopilot.nothingWaiting")}</p>
        ) : (
          <ul className="autopilot-gate-list">
            {snapshot.pending_gates.map((gate) => (
              <li key={gate.id} className="autopilot-gate-item">
                <div className="autopilot-gate-head">
                  <div className="autopilot-gate-meta">
                    <span className="autopilot-gate-kind">{t(gateKindI18nKey(gate.kind))}</span>
                    <time className="muted autopilot-gate-time" dateTime={gate.created_at}>
                      {formatTimestamp(gate.created_at)}
                    </time>
                  </div>
                  <h5 className="autopilot-gate-title">{gate.title}</h5>
                </div>
                {gate.detail?.trim() ? (
                  <p className="muted autopilot-gate-detail">{gate.detail}</p>
                ) : null}
                <div className="autopilot-gate-actions">
                  {gate.kind === "directive" ? (
                    <>
                      <button type="button" className="primary-action" disabled={busy} onClick={() => void handleGateAction(gate, "approve")}>
                        {t("autopilot.approveRoute")}
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
                        {t("common.edit")}
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
                        {t("autopilot.reject")}
                      </button>
                    </>
                  ) : null}
                  {gate.kind === "deliverable" ? (
                    <>
                      <button type="button" className="primary-action" disabled={busy} onClick={() => void handleGateAction(gate, "approve")}>
                        {t("autopilot.approve")}
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
                        {t("autopilot.reject")}
                      </button>
                      {gate.workspace_page_id ? (
                        <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "open")}>
                          {t("autopilot.openDeliverable")}
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
                                t("autopilot.msg.followUp"),
                              )
                            : undefined
                        }
                      >
                        {t("autopilot.followUp")}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "dismiss")}>
                        {t("common.dismiss")}
                      </button>
                    </>
                  ) : null}
                  {gate.kind === "story_brief" && gate.work_node_id ? (
                    <>
                      {gate.workspace_page_id ? (
                        <button type="button" disabled={busy} onClick={() => void handleGateAction(gate, "open")}>
                          {t("autopilot.openWorkspace")}
                        </button>
                      ) : (
                        <span className="muted">{t("autopilot.preparingBrief")}</span>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSelectedGateId(gate.id);
                          setDrawerMode("edit_criteria");
                          setCriteriaDraft(t("autopilot.criteriaPlaceholder"));
                        }}
                      >
                        {t("autopilot.editCriteria")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          gate.work_node_id
                            ? void run(
                                () => ceoRerouteStory(gate.work_node_id!),
                                t("autopilot.msg.storyReroute"),
                              )
                            : undefined
                        }
                      >
                        {t("autopilot.rejectReroute")}
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
                    {t("common.comment")}
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
              ? t("common.comment")
              : drawerMode === "edit_directive"
                ? t("autopilot.editDirective")
                : drawerMode === "edit_criteria"
                  ? t("autopilot.editAcceptance")
                  : t("autopilot.reject")}
            {" · "}
            {selectedGate.title}
          </h5>

          {drawerMode === "comment" ? (
            <textarea
              className="autopilot-comment-box"
              rows={3}
              placeholder={t("autopilot.commentPlaceholder")}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
          ) : null}

          {drawerMode === "edit_directive" ? (
            <div className="autopilot-drawer-fields">
              <label className="field-label">
                {t("common.title")}
                <input
                  type="text"
                  value={editTitleDraft}
                  onChange={(e) => setEditTitleDraft(e.target.value)}
                />
              </label>
              <label className="field-label">
                {t("common.description")}
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
              placeholder={t("autopilot.criteriaPlaceholder")}
              value={criteriaDraft}
              onChange={(e) => setCriteriaDraft(e.target.value)}
            />
          ) : null}

          {drawerMode === "reject" ? (
            <textarea
              className="autopilot-comment-box"
              rows={3}
              placeholder={t("autopilot.rejectPlaceholder")}
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
                {t("autopilot.saveComment")}
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
                  }, t("autopilot.msg.directiveUpdated"))
                }
              >
                {t("autopilot.saveEdits")}
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
                  }, t("autopilot.msg.criteriaUpdated"));
                }}
              >
                {t("autopilot.saveCriteria")}
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
                {t("autopilot.confirmReject")}
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
              {t("common.close")}
            </button>
          </div>
        </div>
      ) : null}

      {snapshot.recent_interventions.length > 0 ? (
        <section className="autopilot-interventions-log">
          <h5>{t("autopilot.recentInterventions")}</h5>
          <ul>
            {snapshot.recent_interventions.slice().reverse().slice(0, 8).map((item) => (
              <li key={item.id}>
                <strong>{interventionActionLabel(t, item.action)}</strong>{" "}
                {interventionKindLabel(t, item.item_kind)} · {formatTimestamp(item.timestamp)}
                {item.comment ? <span className="muted"> — {item.comment}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}