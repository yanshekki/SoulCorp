import { invoke } from "../../utils/tauriInvoke";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGameStore } from "../../stores/gameStore";
import { TRANSCRIPT_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { SearchableListToolbar } from "./SearchableListToolbar";
import { openWorkspacePage } from "../../utils/openWorkspacePage";
import {
  clearLocalProgress,
  reportLocalProgress,
  useProgressStore,
} from "../../stores/progressStore";
import { formatAgentOptionLabel } from "../../utils/agentLabel";
import { EffectiveBrainPill } from "./brain/EffectiveBrainPill";
import { ThoughtStreamPane } from "./observatory/ThoughtStreamPane";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { legacyMeetingLabel, transportForEntry } from "../../utils/agentRuntimeCatalog";
import { logClientError } from "../../utils/appLog";
import { useI18n } from "../../i18n/I18nProvider";
import type {
  BrainResolutionPreview,
  MeetingHistoryItem,
  MeetingAiStatus,
  MeetingSnapshot,
  MeetingTurnCostEstimate,
  RuntimeCatalog,
} from "../../types/game";

/** Quick presets — users can also type any custom type / title. */
const MEETING_TYPE_PRESETS = [
  "Daily Standup",
  "Project Kickoff",
  "Crisis Meeting",
  "Team Building",
  "Strategy Discussion",
  "Sprint Planning",
  "Retro",
  "1:1",
] as const;


const MEETING_TYPE_LABEL_KEYS: Record<string, string> = {
  "Daily Standup": "meeting.type.dailyStandup",
  "Project Kickoff": "meeting.type.projectKickoff",
  "Crisis Meeting": "meeting.type.crisisMeeting",
  "Team Building": "meeting.type.teamBuilding",
  "Strategy Discussion": "meeting.type.strategyDiscussion",
  "Sprint Planning": "meeting.type.sprintPlanning",
  Retro: "meeting.type.retro",
  "1:1": "meeting.type.oneOnOne",
};

function meetingTypeLabel(type: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const key = MEETING_TYPE_LABEL_KEYS[type];
  return key ? t(key) : type;
}

const MEETING_TYPE_MAX = 120;
const MEETING_TOPIC_MAX = 280;

function resolveMeetingLabel(type: string, topic: string): string {
  const t = type.trim().replace(/\s+/g, " ");
  const theme = topic.trim().replace(/\s+/g, " ");
  if (!t && !theme) return "";
  if (!theme) return t.slice(0, MEETING_TYPE_MAX);
  if (!t) return theme.slice(0, MEETING_TYPE_MAX);
  const combined = `${t} — ${theme}`;
  return combined.slice(0, MEETING_TYPE_MAX + MEETING_TOPIC_MAX);
}

export const MEETING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "session", label: "Session" },
  { id: "transcript", label: "Transcript" },
  { id: "history", label: "History" },
] as const;

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function listToLines(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}

function formatMeetingWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

interface MeetingPanelProps {
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

function MeetingCard({
  id,
  title,
  description,
  activeSection,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  activeSection: string;
  children: ReactNode;
}) {
  if (activeSection !== id) {
    return null;
  }
  return (
    <section
      id={id}
      className={`meeting-card meeting-card--${id}`}
      data-meeting-section={id}
    >
      <header className="meeting-card-header">
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      <div className="meeting-card-body">{children}</div>
    </section>
  );
}

export function MeetingPanel({ activeSection, onNavigateSection }: MeetingPanelProps) {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const activeMeeting = useGameStore((state) => state.activeMeeting);
  const setActiveMeeting = useGameStore((state) => state.setActiveMeeting);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const activitySessions = useAgentActivityStore((state) => state.sessions);
  const activityEvents = useAgentActivityStore((state) => state.events);
  const liveBuffers = useAgentActivityStore((state) => state.liveBuffers);
  const [meetingType, setMeetingType] = useState<string>(MEETING_TYPE_PRESETS[0]);
  const [meetingTopic, setMeetingTopic] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [aiStatus, setAiStatus] = useState<MeetingAiStatus | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [turnCost, setTurnCost] = useState<MeetingTurnCostEstimate | null>(null);
  const [brainPreviews, setBrainPreviews] = useState<BrainResolutionPreview[]>([]);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const [transcriptSearchType, setTranscriptSearchType] = useState(SEARCH_TYPE_ALL);
  const debouncedTranscriptQuery = useDebouncedValue(transcriptSearchQuery);
  const [history, setHistory] = useState<MeetingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingRecap, setEditingRecap] = useState(false);
  const [savingRecap, setSavingRecap] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editKeyPoints, setEditKeyPoints] = useState("");
  const [editDecisions, setEditDecisions] = useState("");
  const [editActions, setEditActions] = useState("");
  const [editRisks, setEditRisks] = useState("");
  const [rewriteNotesOnSave, setRewriteNotesOnSave] = useState(true);

  const filteredMessages = useMemo(() => {
    const messages = activeMeeting?.messages ?? [];
    return filterByScopedQuery(messages, debouncedTranscriptQuery, transcriptSearchType, {
      all: (message) => [
        message.speaker_name,
        message.content,
        message.provider ?? "",
        message.speaker_id,
      ],
      speaker: (message) => [message.speaker_name, message.speaker_id],
      content: (message) => [message.content],
      provider: (message) => [message.provider ?? ""],
    });
  }, [activeMeeting?.messages, debouncedTranscriptQuery, transcriptSearchType]);

  const selectableAgents = useMemo(
    () => agentRecords.filter((agent) => agent.agent_kind !== "fate"),
    [agentRecords],
  );
  const usingLiveLlm = aiStatus?.active_provider !== "mock";
  const brainPreviewByAgentId = useMemo(
    () => new Map(brainPreviews.map((preview) => [preview.agent_id, preview])),
    [brainPreviews],
  );

  const meetingBrainForAgent = (agentId: string) => brainPreviewByAgentId.get(agentId);

  const liveMeetingSession = useMemo(() => {
    if (!activeMeeting || activeMeeting.completed) {
      return null;
    }
    return (
      activitySessions.find(
        (session) =>
          session.status === "active"
          && session.source === "meeting"
          && session.meeting_id === activeMeeting.id,
      )
      ?? activitySessions.find(
        (session) => session.status === "active" && session.source === "meeting",
      )
      ?? null
    );
  }, [activitySessions, activeMeeting]);

  const liveDraftText = liveMeetingSession
    ? (liveBuffers[liveMeetingSession.id] ?? "")
    : "";
  const showLiveStream = Boolean(advancing || liveMeetingSession);

  const refreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const items = await invoke<MeetingHistoryItem[]>("list_meetings", { limit: 50 });
      setHistory(items);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [status, previews, catalog] = await Promise.all([
          invoke<MeetingAiStatus>("get_meeting_ai_status"),
          invoke<BrainResolutionPreview[]>("get_brain_resolution_preview", { agentId: null }),
          invoke<RuntimeCatalog>("get_agent_runtime_catalog"),
        ]);
        setAiStatus(status);
        setBrainPreviews(previews);
        setRuntimeCatalog(catalog);
      } catch (error) {
        setStatusMessage(String(error));
      }
    };
    void load();
    void refreshHistory();
  }, [activeCompanyId, setStatusMessage]);

  useEffect(() => {
    // Keep edit form in sync when the viewed meeting changes (unless mid-edit).
    if (editingRecap) return;
    if (!activeMeeting?.completed) {
      setEditSummary("");
      setEditKeyPoints("");
      setEditDecisions("");
      setEditActions("");
      setEditRisks("");
      return;
    }
    setEditSummary(activeMeeting.outcome_summary ?? "");
    setEditKeyPoints(listToLines(activeMeeting.key_points));
    setEditDecisions(listToLines(activeMeeting.decisions));
    setEditActions(listToLines(activeMeeting.action_items));
    setEditRisks(listToLines(activeMeeting.risks_blockers));
  }, [activeMeeting, editingRecap]);

  useEffect(() => {
    if (agentRecords.length === 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      const valid = current.filter((id) => agentRecords.some((agent) => agent.id === id));
      if (valid.length > 0) {
        return valid;
      }
      return agentRecords.slice(0, Math.min(2, agentRecords.length)).map((agent) => agent.id);
    });
  }, [agentRecords]);


  const toggleAgent = (agentId: string) => {
    setSelectedIds((current) => {
      if (current.includes(agentId)) {
        return current.filter((id) => id !== agentId);
      }
      if (current.length >= 12) {
        setStatusMessage(t("status.meetingMaxParticipants"));
        return current;
      }
      return [...current, agentId];
    });
  };

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const startMeeting = async () => {
    if (starting) {
      return;
    }
    if (selectedIds.length < 2) {
      setStartError("Select at least two participants.");
      setStatusMessage(t("status.meetingMinParticipants"));
      return;
    }
    const resolvedType = resolveMeetingLabel(meetingType, meetingTopic);
    if (!resolvedType) {
      setStartError("Enter a meeting type or topic.");
      setStatusMessage(t("status.meetingNeedTopic"));
      return;
    }
    setStarting(true);
    setStartError(null);
    setStatusMessage(t("status.meetingStarting", { type: resolvedType }));
    try {
      const meeting = await invoke<MeetingSnapshot>("start_meeting", {
        request: {
          agent_ids: selectedIds,
          meeting_type: resolvedType,
        },
      });
      setActiveMeeting(meeting);
      setTurnCost(null);
      setStatusMessage(
        `Meeting started: ${resolvedType}. ${autoAdvance ? "Auto-advancing turns…" : "Press Next Turn."}`,
      );
      // Kick first turn immediately when auto-advance is on (don't wait for cost estimate race).
      if (autoAdvance) {
        window.setTimeout(() => {
          // advanceMeeting reads activeMeeting from closure — use store after setState flushes
          void (async () => {
            try {
              const next = await invoke<MeetingSnapshot>("advance_meeting", {
                meetingId: meeting.id,
              });
              setActiveMeeting(next);
              if (!next.completed) {
                try {
                  const estimate = await invoke<MeetingTurnCostEstimate>(
                    "estimate_meeting_turn_cost",
                    { meetingId: next.id },
                  );
                  setTurnCost(estimate);
                } catch {
                  setTurnCost(null);
                }
              }
            } catch (error) {
              setStartError(String(error));
              setStatusMessage(String(error));
              setAutoAdvance(false);
            }
          })();
        }, 50);
      }
    } catch (error) {
      const message = String(error);
      setStartError(message);
      setStatusMessage(message);
      void logClientError("meeting", "start_meeting", message);
    } finally {
      setStarting(false);
    }
  };

  const advanceMeeting = async () => {
    if (!activeMeeting || advancing) return;
    setAdvancing(true);
    // Backend owns progress labels (Connecting / Streaming / error). Keep a light local hint only.
    const providerHint = aiStatus?.active_provider
      ? legacyMeetingLabel(aiStatus.active_provider)
      : t("transport.builtin");
    reportLocalProgress(
      "meeting_advance",
      t("meeting.startingTurn", { provider: providerHint }),
      -1,
      "llm",
    );
    try {
      const meeting = await invoke<MeetingSnapshot>("advance_meeting", {
        meetingId: activeMeeting.id,
      });
      setActiveMeeting(meeting);
      if (!meeting.completed) {
        try {
          const estimate = await invoke<MeetingTurnCostEstimate>("estimate_meeting_turn_cost", {
            meetingId: meeting.id,
          });
          setTurnCost(estimate);
        } catch {
          setTurnCost(null);
        }
      } else {
        setTurnCost(null);
      }
      if (meeting.completed) {
        const outcome = meeting.outcome_summary ?? t("meeting.completedDefault");
        const tasks = meeting.tasks_spawned ?? 0;
        const workBit = meeting.work_started
          ? t("meeting.workStarted")
          : tasks > 0
            ? t("meeting.tasksQueued")
            : "";
        setStatusMessage(
          t("meeting.closedStatus", { tasks, work: workBit, outcome }),
        );
        // Re-fetch full snapshot (action_task_links) without wiping recap.
        try {
          const full = await invoke<MeetingSnapshot>("get_meeting", {
            meetingId: meeting.id,
          });
          setActiveMeeting(full);
        } catch {
          // keep advance_meeting snapshot
        }
        void refreshHistory();
        const { refreshWorkspaceTree } = await import("../../services/workspaceClient");
        await refreshWorkspaceTree(true).catch(() => undefined);
        // Refresh game/scrum so Command Center sees new tasks immediately.
        // Do not call full reloadGameState — it briefly clears meeting UI.
        try {
          const { clearScrumSnapshotCache } = await import("../../stores/scrumSnapshotCache");
          clearScrumSnapshotCache();
        } catch {
          // non-fatal
        }
      }
    } catch (error) {
      const message = String(error);
      setStatusMessage(message);
      void logClientError("meeting", "advance_meeting", message);
      // Stop auto-advance on hard failures so we don't spin forever.
      setAutoAdvance(false);
    } finally {
      // Always drop local + backend progress so the LIVE dock cannot stick on other pages.
      clearLocalProgress("meeting_advance");
      useProgressStore.getState().clearProgress("meeting_advance");
      setAdvancing(false);
    }
  };

  // If the meeting already closed, ensure no leftover closing overlay.
  useEffect(() => {
    if (activeMeeting?.completed) {
      clearLocalProgress("meeting_advance");
      useProgressStore.getState().clearProgress("meeting_advance");
    }
  }, [activeMeeting?.id, activeMeeting?.completed]);

  useEffect(() => {
    if (!activeMeeting || activeMeeting.completed) {
      setTurnCost(null);
      return;
    }
    const loadCost = async () => {
      try {
        const estimate = await invoke<MeetingTurnCostEstimate>("estimate_meeting_turn_cost", {
          meetingId: activeMeeting.id,
        });
        setTurnCost(estimate);
      } catch (error) {
        setTurnCost(null);
        setStatusMessage(String(error));
      }
    };
    void loadCost();
  }, [activeMeeting, setStatusMessage]);

  useEffect(() => {
    if (!autoAdvance || !activeMeeting || activeMeeting.completed || advancing) {
      return;
    }
    if (turnCost && !turnCost.affordable) {
      return;
    }
    // Keep turns moving; last turn also auto-closes + spawns work on the backend.
    const delay = usingLiveLlm ? 1800 : 900;
    const timer = window.setTimeout(() => {
      void advanceMeeting();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeMeeting, autoAdvance, advancing, usingLiveLlm, turnCost]);

  const openHistoryMeeting = async (meetingId: string) => {
    try {
      const meeting = await invoke<MeetingSnapshot>("get_meeting", { meetingId });
      setActiveMeeting(meeting);
      setEditingRecap(false);
      setStatusMessage(
        meeting.completed
          ? t("meeting.openedRecap", {
              type: meetingTypeLabel(meeting.meeting_type, t),
            })
          : t("meeting.resumedMeeting", {
              type: meetingTypeLabel(meeting.meeting_type, t),
            }),
      );
      onNavigateSection?.(meeting.completed ? "transcript" : "session");
    } catch (error) {
      setStatusMessage(String(error));
      void logClientError("meeting", "get_meeting", String(error));
    }
  };

  const exportMinutes = async (meetingId?: string) => {
    const id = meetingId ?? activeMeeting?.id;
    if (!id || exporting) return;
    setExporting(true);
    try {
      const path = await invoke<string>("export_meeting_minutes", { meetingId: id });
      setStatusMessage(t("status.minutesExported", { path }));
    } catch (error) {
      setStatusMessage(String(error));
      void logClientError("meeting", "export_meeting_minutes", String(error));
    } finally {
      setExporting(false);
    }
  };

  const beginEditRecap = () => {
    if (!activeMeeting?.completed) return;
    setEditSummary(activeMeeting.outcome_summary ?? "");
    setEditKeyPoints(listToLines(activeMeeting.key_points));
    setEditDecisions(listToLines(activeMeeting.decisions));
    setEditActions(listToLines(activeMeeting.action_items));
    setEditRisks(listToLines(activeMeeting.risks_blockers));
    setEditingRecap(true);
  };

  const cancelEditRecap = () => {
    setEditingRecap(false);
  };

  const saveRecap = async () => {
    if (!activeMeeting?.completed || savingRecap) return;
    setSavingRecap(true);
    try {
      const updated = await invoke<MeetingSnapshot>("update_meeting_recap", {
        request: {
          meeting_id: activeMeeting.id,
          outcome_summary: editSummary,
          key_points: linesToList(editKeyPoints),
          decisions: linesToList(editDecisions),
          action_items: linesToList(editActions),
          risks_blockers: linesToList(editRisks),
          rewrite_notes: rewriteNotesOnSave,
        },
      });
      setActiveMeeting(updated);
      setEditingRecap(false);
      setStatusMessage(
        rewriteNotesOnSave
          ? "Recap saved and workspace notes rewritten."
          : "Recap saved.",
      );
      void refreshHistory();
      if (rewriteNotesOnSave) {
        const { refreshWorkspaceTree } = await import("../../services/workspaceClient");
        await refreshWorkspaceTree(true).catch(() => undefined);
      }
    } catch (error) {
      setStatusMessage(String(error));
      void logClientError("meeting", "update_meeting_recap", String(error));
    } finally {
      setSavingRecap(false);
    }
  };

  const actionLinks =
    activeMeeting?.action_task_links && activeMeeting.action_task_links.length > 0
      ? activeMeeting.action_task_links
      : (activeMeeting?.action_items ?? []).map((action) => ({
          action,
          task_id: null as string | null,
          task_title: null as string | null,
        }));

  return (
    <div className="meeting-panel meeting-panel--page" ref={scrollRootRef}>
      <MeetingCard
        id="overview"
        activeSection={activeSection}
        title={t("meeting.card.llmReadiness")}
        description={t("meeting.card.llmReadinessDesc")}
      >
        {aiStatus ? (
          <div className="meeting-ai-status">
            <span className={`hub-pill ${usingLiveLlm ? "online" : "offline"}`}>
              {t("meeting.llmProviderPill", {
                provider: legacyMeetingLabel(aiStatus.active_provider),
              })}
            </span>
            <span className="hub-pill tier">
              {legacyMeetingLabel(aiStatus.configured_provider)}
            </span>
            {aiStatus.ollama_reachable ? <span className="hub-pill online">{t("meeting.ollamaReady")}</span> : null}
            {aiStatus.hub_reachable ? <span className="hub-pill online">{t("meeting.hubChatReady")}</span> : null}
            <p className="muted">{aiStatus.message}</p>
            {!usingLiveLlm ? (
              <p className="hub-warning" role="status">
                {t("meeting.mockWarning")}
              </p>
            ) : null}
            <div className="panel-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => onNavigateSection?.("session")}
              >
                {t("meeting.startSession")}
              </button>
              {!usingLiveLlm ? (
                <button type="button" onClick={() => setActivePanel("settings")}>
                  {t("meeting.openSettingsAi")}
                </button>
              ) : (
                <button type="button" onClick={() => setActivePanel("agents")}>
                  {t("meeting.openAgentBrains")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="muted">{t("meeting.loadingAiStatus")}</p>
        )}
      </MeetingCard>

      <MeetingCard
        id="session"
        activeSection={activeSection}
        title={t("meeting.card.session")}
        description={t("meeting.card.sessionDesc")}
      >
        <div className="meeting-type-fields">
          <label className="field-label">
            {t("meeting.typeTitle")}
            <input
              type="text"
              list="meeting-type-presets"
              value={meetingType}
              maxLength={MEETING_TYPE_MAX}
              placeholder={t("meeting.titlePlaceholder")}
              onChange={(event) => setMeetingType(event.target.value)}
              autoComplete="off"
            />
            <datalist id="meeting-type-presets">
              {MEETING_TYPE_PRESETS.map((type) => (
                <option key={type} value={type}>
                  {meetingTypeLabel(type, t)}
                </option>
              ))}
            </datalist>
          </label>

          <div className="meeting-type-presets" role="group" aria-label={t("meeting.quickTypes")}>
            {MEETING_TYPE_PRESETS.map((type) => (
              <button
                key={type}
                type="button"
                className={
                  meetingType === type
                    ? "secondary-action meeting-type-chip meeting-type-chip--active"
                    : "secondary-action meeting-type-chip"
                }
                onClick={() => setMeetingType(type)}
              >
                {meetingTypeLabel(type, t)}
              </button>
            ))}
          </div>

          <label className="field-label">
            {t("meeting.topicLabel")}
            <input
              type="text"
              value={meetingTopic}
              maxLength={MEETING_TOPIC_MAX}
              placeholder={t("meeting.topicPlaceholder")}
              onChange={(event) => setMeetingTopic(event.target.value)}
              autoComplete="off"
            />
          </label>

          {resolveMeetingLabel(meetingType, meetingTopic) ? (
            <p className="muted meeting-type-preview" role="status">
              {t("meeting.willStartAs")}{" "}
              <strong>{meetingTopic.trim() ? resolveMeetingLabel(meetingType, meetingTopic) : meetingTypeLabel(meetingType, t)}</strong>
            </p>
          ) : (
            <p className="hub-warning" role="status">
              {t("meeting.typeTitleOrTopic")}
            </p>
          )}
        </div>

        <div className="agent-picker">
          {selectableAgents.map((agent) => {
            const preview = meetingBrainForAgent(agent.id);
            const transport = transportForEntry(
              runtimeCatalog?.runtimes.find((entry) => entry.id === preview?.meeting_brain_id),
            );
            return (
              <label key={agent.id} className="checkbox-row meeting-agent-picker-row">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(agent.id)}
                  onChange={() => toggleAgent(agent.id)}
                />
                <span className="meeting-agent-picker-label">
                  {formatAgentOptionLabel(agent)}
                  {preview ? (
                    <EffectiveBrainPill label={preview.meeting_brain_label} transport={transport} />
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(event) => setAutoAdvance(event.target.checked)}
          />
          <span>{t("meeting.autoAdvance")}</span>
        </label>

        {startError ? (
          <p className="hub-warning" role="alert">
            {startError}
          </p>
        ) : null}

        {turnCost ? (
          <p className={turnCost.affordable ? "muted" : "hub-warning"} role="status">
            {turnCost.message}
            {turnCost.estimated_tokens > 0 ? t("meeting.tokensEst", { n: turnCost.estimated_tokens }) : ""}
            {!turnCost.affordable
              ? t("meeting.topUpHint")
              : ""}
          </p>
        ) : null}

        {activeMeeting && !activeMeeting.completed ? (
          <p className="muted" role="status">
            {t("meeting.activeStatus", {
              type: meetingTypeLabel(activeMeeting.meeting_type, t),
              current: activeMeeting.messages.length + 1,
              total:
                (activeMeeting.participant_ids?.length ?? 0) *
                (activeMeeting.turns_per_agent ?? 1),
              provider: legacyMeetingLabel(activeMeeting.active_provider),
            })}
          </p>
        ) : null}

        {showLiveStream ? (
          <div className="meeting-thought-stream">
            <div className="meeting-thought-stream-header">
              <span className="observatory-live-pill meeting-live-pill">
                <span className="observatory-live-dot" aria-hidden="true" />
                {t("meeting.liveStream")}
              </span>
              {liveMeetingSession ? (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    useAgentActivityStore.getState().selectAgent(liveMeetingSession.agent_id);
                    useAgentActivityStore.getState().selectSession(liveMeetingSession.id);
                    setActivePanel("observatory");
                  }}
                >
                  {t("meeting.openObservatory")}
                </button>
              ) : null}
            </div>
            {liveMeetingSession ? (
              <ThoughtStreamPane
                session={liveMeetingSession}
                events={activityEvents}
                compact
              />
            ) : (
              <pre className="meeting-live-draft muted">
                {advancing
                  ? t("meeting.startingStream")
                  : t("meeting.waitingSpeaker")}
              </pre>
            )}
          </div>
        ) : null}

        <div className="panel-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void startMeeting()}
            disabled={
              starting
              || selectedIds.length < 2
              || !resolveMeetingLabel(meetingType, meetingTopic)
            }
          >
            {starting
              ? t("meeting.starting")
              : activeMeeting && !activeMeeting.completed
                ? t("meeting.restart")
                : t("meeting.start")}
          </button>
          <button
            type="button"
            onClick={() => void advanceMeeting()}
            disabled={
              !activeMeeting ||
              activeMeeting.completed ||
              advancing ||
              starting ||
              (turnCost != null && !turnCost.affordable)
            }
          >
            {advancing ? t("meeting.streamingTurn") : t("meeting.nextTurn")}
          </button>
        </div>
      </MeetingCard>

      <MeetingCard
        id="transcript"
        activeSection={activeSection}
        title={t("meeting.card.transcript")}
        description={t("meeting.card.transcriptDesc")}
      >
        {activeMeeting ? (
          <div className="meeting-log">
            <h4>
              {meetingTypeLabel(activeMeeting.meeting_type, t)}
              {activeMeeting.completed ? t("meeting.completedSuffix") : ""}
              <span className="meeting-provider-pill">
                {legacyMeetingLabel(activeMeeting.active_provider)}
              </span>
              <span className="meeting-provider-pill">
                {t("meeting.turnsAgent", { n: activeMeeting.turns_per_agent })}
              </span>
            </h4>
            {activeMeeting.messages.length > 0 ? (
              <SearchableListToolbar
                query={transcriptSearchQuery}
                onQueryChange={setTranscriptSearchQuery}
                placeholder={t("meeting.searchTranscript")}
                ariaLabel={t("meeting.searchTranscriptAria")}
                matchCount={
                  debouncedTranscriptQuery.trim() ? filteredMessages.length : undefined
                }
                totalCount={activeMeeting.messages.length}
                typeFilter={{
                  value: transcriptSearchType,
                  onChange: setTranscriptSearchType,
                  options: TRANSCRIPT_SEARCH_TYPES,
                  ariaLabel: t("meeting.filterTranscriptAria"),
                  label: t("searchType.typeLabel"),
                }}
              />
            ) : null}
            {activeMeeting.messages.length === 0 && !showLiveStream ? (
              <p className="muted">{t("meeting.noMessagesYet")}</p>
            ) : debouncedTranscriptQuery.trim() && filteredMessages.length === 0 && !showLiveStream ? (
              <p className="search-empty-hint muted">
                {t("meeting.noTranscriptMatches", { query: debouncedTranscriptQuery })}
              </p>
            ) : (
              <>
                {filteredMessages.map((message, index) => {
                  const preview = meetingBrainForAgent(message.speaker_id);
                  const transport = transportForEntry(
                    runtimeCatalog?.runtimes.find((entry) => entry.id === preview?.meeting_brain_id),
                  );
                  return (
                    <article key={`${message.speaker_id}-${index}`} className="meeting-message">
                      <header className="meeting-message-header">
                        <strong>{message.speaker_name}</strong>
                        {preview ? (
                          <EffectiveBrainPill
                            label={preview.meeting_brain_label}
                            transport={transport}
                          />
                        ) : message.provider ? (
                          <span className="meeting-message-provider">{message.provider}</span>
                        ) : null}
                      </header>
                      <p>{message.content}</p>
                    </article>
                  );
                })}
                {showLiveStream && liveMeetingSession ? (
                  <article className="meeting-message meeting-message--streaming" aria-live="polite">
                    <header className="meeting-message-header">
                      <strong>{liveMeetingSession.agent_name}</strong>
                      <span className="observatory-live-pill meeting-live-pill">
                        <span className="observatory-live-dot" aria-hidden="true" />
                        {t("meeting.speaking")}
                      </span>
                      <span className="meeting-message-provider">
                        {liveMeetingSession.brain_label}
                      </span>
                    </header>
                    <p className="meeting-live-draft">
                      {liveDraftText || "…"}
                      <span className="observatory-cursor">▍</span>
                    </p>
                  </article>
                ) : null}
              </>
            )}
            {activeMeeting.completed ? (
              <div className="meeting-outcome-panel meeting-recap">
                <header className="meeting-recap-header">
                  <p className="workflow-step-badge">{t("meeting.completed")}</p>
                  <h3>
                    {t("meeting.recapTitle", {
                      type: meetingTypeLabel(activeMeeting.meeting_type, t),
                    })}
                  </h3>
                  {activeMeeting.completed_at ? (
                    <p className="muted meeting-recap-when">
                      {t("meeting.closedWhen", { when: formatMeetingWhen(activeMeeting.completed_at) })}
                    </p>
                  ) : null}
                  {!editingRecap ? (
                    activeMeeting.outcome_summary ? (
                      <p className="meeting-outcome">{activeMeeting.outcome_summary}</p>
                    ) : (
                      <p className="muted">{t("meeting.closed")}</p>
                    )
                  ) : (
                    <label className="field-label meeting-recap-edit-field">
                      Summary
                      <textarea
                        rows={3}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                      />
                    </label>
                  )}
                </header>

                {!editingRecap ? (
                  <div className="meeting-recap-grid">
                    <section className="meeting-recap-section">
                      <h4>{t("meeting.keyPoints")}</h4>
                      {(activeMeeting.key_points ?? []).length > 0 ? (
                        <ul>
                          {(activeMeeting.key_points ?? []).map((item, i) => (
                            <li key={`kp-${i}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">{t("meeting.noKeyPoints")}</p>
                      )}
                    </section>
                    <section className="meeting-recap-section">
                      <h4>{t("meeting.decisions")}</h4>
                      {(activeMeeting.decisions ?? []).length > 0 ? (
                        <ul>
                          {(activeMeeting.decisions ?? []).map((item, i) => (
                            <li key={`dec-${i}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">{t("meeting.noDecisionsExplicit")}</p>
                      )}
                    </section>
                    <section className="meeting-recap-section">
                      <h4>{t("meeting.actionItems")}</h4>
                      {actionLinks.length > 0 ? (
                        <ul className="meeting-action-links">
                          {actionLinks.map((link, i) => (
                            <li key={`act-${i}`}>
                              <span>{link.action}</span>
                              {link.task_id ? (
                                <button
                                  type="button"
                                  className="meeting-task-link"
                                  title={link.task_title ?? link.task_id}
                                  onClick={() => setActivePanel("projects")}
                                >
                                  {link.task_title
                                    ? `→ ${link.task_title}`
                                    : `→ task ${link.task_id.slice(0, 8)}…`}
                                </button>
                              ) : (
                                <span className="muted meeting-task-link-missing">
                                  {t("meeting.noTaskLink")}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">{t("meeting.noActionItems")}</p>
                      )}
                    </section>
                    {(activeMeeting.risks_blockers ?? []).length > 0 ? (
                      <section className="meeting-recap-section meeting-recap-section--wide">
                        <h4>{t("meeting.risksBlockers")}</h4>
                        <ul>
                          {(activeMeeting.risks_blockers ?? []).map((item, i) => (
                            <li key={`risk-${i}`}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                ) : (
                  <div className="meeting-recap-edit-grid">
                    <label className="field-label">
                      {t("meeting.keyPointsEdit")}
                      <textarea
                        rows={4}
                        value={editKeyPoints}
                        onChange={(e) => setEditKeyPoints(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      {t("meeting.decisionsEdit")}
                      <textarea
                        rows={4}
                        value={editDecisions}
                        onChange={(e) => setEditDecisions(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Action items (one per line)
                      <textarea
                        rows={4}
                        value={editActions}
                        onChange={(e) => setEditActions(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Risks & blockers (one per line)
                      <textarea
                        rows={3}
                        value={editRisks}
                        onChange={(e) => setEditRisks(e.target.value)}
                      />
                    </label>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={rewriteNotesOnSave}
                        onChange={(e) => setRewriteNotesOnSave(e.target.checked)}
                      />
                      <span>{t("meeting.rewriteNotes")}</span>
                    </label>
                  </div>
                )}

                <p className="muted meeting-recap-meta">
                  {(activeMeeting.tasks_spawned ?? activeMeeting.task_ids?.length ?? 0) > 0
                    ? t("meeting.tasksSpawned", {
                        n: activeMeeting.tasks_spawned ?? activeMeeting.task_ids?.length,
                      })
                    : t("meeting.noTasksSpawned")}
                  {activeMeeting.work_started ? t("meeting.workStarted") : ""}
                  {t("meeting.agentsIdle")}
                </p>
                {activeMeeting.notes_write_error ? (
                  <p className="meeting-recap-error" role="alert">
                    {t("meeting.notesWriteFailed", {
                      error: activeMeeting.notes_write_error,
                    })}
                  </p>
                ) : null}
                <div className="meeting-workspace-actions panel-actions">
                  {!editingRecap ? (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        disabled={!activeMeeting.notes_page_id}
                        onClick={() => {
                          if (!activeMeeting.notes_page_id) return;
                          void openWorkspacePage(
                            activeMeeting.notes_page_id,
                            t("meeting.notesSuffix", {
                              type: meetingTypeLabel(activeMeeting.meeting_type, t),
                            }),
                          );
                        }}
                      >
                        {t("meeting.openNotes")}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => setActivePanel("projects")}
                      >
                        {t("meeting.openCommandBacklog")}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void exportMinutes(activeMeeting.id)}
                        disabled={exporting}
                      >
                        {exporting ? t("meeting.exporting") : t("meeting.exportMd")}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={beginEditRecap}
                      >
                        {t("meeting.editRecap")}
                      </button>
                      {activeMeeting.notes_write_error || !activeMeeting.notes_page_id ? (
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => {
                            void (async () => {
                              try {
                                await invoke("generate_meeting_notes", {
                                  meetingId: activeMeeting.id,
                                });
                                const next = await invoke<MeetingSnapshot>("get_meeting", {
                                  meetingId: activeMeeting.id,
                                });
                                setActiveMeeting(next);
                                setStatusMessage(t("status.meetingNotesRegen"));
                              } catch (error) {
                                setStatusMessage(String(error));
                              }
                            })();
                          }}
                        >
                          {t("meeting.retryNotes")}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        disabled={savingRecap}
                        onClick={() => void saveRecap()}
                      >
                        {savingRecap ? t("meeting.saving") : t("meeting.saveRecap")}
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={savingRecap}
                        onClick={cancelEditRecap}
                      >
                        {t("common.cancel")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">{t("meeting.startForTranscript")}</p>
        )}
      </MeetingCard>

      <MeetingCard
        id="history"
        activeSection={activeSection}
        title={t("meeting.card.history")}
        description={t("meeting.card.historyDesc")}
      >
        <div className="panel-actions" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void refreshHistory()}
            disabled={historyLoading}
          >
            {historyLoading ? t("meeting.refreshing") : t("meeting.refreshHistory")}
          </button>
        </div>
        {historyLoading && history.length === 0 ? (
          <p className="muted">{t("meeting.loadingHistory")}</p>
        ) : history.length === 0 ? (
          <p className="muted">{t("meeting.noHistory")}</p>
        ) : (
          <ul className="meeting-history-list">
            {history.map((item) => {
              const isOpen = activeMeeting?.id === item.id;
              return (
                <li
                  key={item.id}
                  className={`meeting-history-item${isOpen ? " meeting-history-item--active" : ""}`}
                >
                  <div className="meeting-history-item-main">
                    <strong>{meetingTypeLabel(item.meeting_type, t)}</strong>
                    <span className={`hub-pill ${item.completed ? "online" : "offline"}`}>
                      {item.completed ? t("meeting.completed") : t("meeting.inProgress")}
                    </span>
                    <span className="muted">
                      {formatMeetingWhen(item.completed_at ?? item.started_at)}
                    </span>
                  </div>
                  <p className="muted meeting-history-meta">
                    {t("meeting.historyMeta", {
                      participants: item.participant_count,
                      messages: item.message_count,
                    })}
                    {item.tasks_spawned > 0
                      ? t("meeting.historyMetaTasks", { tasks: item.tasks_spawned })
                      : ""}
                  </p>
                  {item.outcome_summary ? (
                    <p className="meeting-history-summary">{item.outcome_summary}</p>
                  ) : null}
                  {(item.key_points ?? []).length > 0 ? (
                    <ul className="meeting-history-keypoints">
                      {(item.key_points ?? []).slice(0, 3).map((kp, i) => (
                        <li key={`${item.id}-kp-${i}`}>{kp}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => void openHistoryMeeting(item.id)}
                    >
                      {isOpen
                        ? t("meeting.viewing")
                        : item.completed
                          ? t("meeting.openRecap")
                          : t("meeting.resume")}
                    </button>
                    {item.completed ? (
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={exporting}
                        onClick={() => void exportMinutes(item.id)}
                      >
                        {t("meeting.export")}
                      </button>
                    ) : null}
                    {item.notes_page_id ? (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          if (!item.notes_page_id) return;
                          void openWorkspacePage(
                            item.notes_page_id,
                            t("meeting.notesSuffix", {
                              type: meetingTypeLabel(item.meeting_type, t),
                            }),
                          );
                        }}
                      >
                        {t("meeting.notesShort")}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </MeetingCard>
    </div>
  );
}