import { create } from "zustand";
import type {
  AgentActivityEvent,
  AgentActivitySession,
} from "../types/agentActivity";

const MAX_EVENTS = 500;

/** High-frequency active-agent ids for the 3D renderer (avoids 60fps React updates). */
export const agentActivityRuntimeRef: { activeAgentIds: Set<string> } = {
  activeAgentIds: new Set(),
};

function syncRuntimeRef(sessions: AgentActivitySession[]): void {
  agentActivityRuntimeRef.activeAgentIds = new Set(
    sessions.filter((session) => session.status === "active").map((session) => session.agent_id),
  );
}

interface AgentActivityStore {
  sessions: AgentActivitySession[];
  events: AgentActivityEvent[];
  liveBuffers: Record<string, string>;
  selectedAgentId: string | null;
  selectedSessionId: string | null;
  filterAgentId: string | null;
  setSnapshot: (sessions: AgentActivitySession[], events: AgentActivityEvent[]) => void;
  appendPayload: (event: AgentActivityEvent, session?: AgentActivitySession | null) => void;
  selectAgent: (agentId: string | null) => void;
  selectSession: (sessionId: string | null) => void;
  setFilterAgent: (agentId: string | null) => void;
  liveTextForSession: (sessionId: string) => string;
}

function upsertSession(
  sessions: AgentActivitySession[],
  session: AgentActivitySession,
): AgentActivitySession[] {
  const index = sessions.findIndex((entry) => entry.id === session.id);
  if (index < 0) {
    return [...sessions, session].slice(-50);
  }
  const next = [...sessions];
  next[index] = session;
  return next;
}

export const useAgentActivityStore = create<AgentActivityStore>((set, get) => ({
  sessions: [],
  events: [],
  liveBuffers: {},
  selectedAgentId: null,
  selectedSessionId: null,
  filterAgentId: null,
  setSnapshot: (sessions, events) => {
    syncRuntimeRef(sessions);
    // Rebuild live text from persisted events so a remount doesn't show
    // "Waiting for tokens…" for a session that already streamed.
    const liveBuffers: Record<string, string> = {};
    for (const event of events) {
      if (event.kind === "token_delta" && event.content_delta) {
        liveBuffers[event.session_id] =
          `${liveBuffers[event.session_id] ?? ""}${event.content_delta}`;
      }
      if (event.kind === "step_complete" && event.content_full) {
        liveBuffers[event.session_id] = event.content_full;
      }
      if (event.kind === "error" && event.content_full) {
        liveBuffers[event.session_id] =
          `${liveBuffers[event.session_id] ?? ""}\n\n[error] ${event.content_full}`.trim();
      }
    }
    set({ sessions, events, liveBuffers });
  },
  appendPayload: (event, session) =>
    set((state) => {
      // Don't store every single token in the event ring (keeps UI responsive).
      const shouldStoreEvent = event.kind !== "token_delta" || state.events.length % 12 === 0;
      const events = shouldStoreEvent
        ? [...state.events, event].slice(-MAX_EVENTS)
        : state.events;
      let sessions = session ? upsertSession(state.sessions, session) : state.sessions;
      // Lightweight active shell when token deltas arrive before session_start is applied.
      if (
        !session
        && (event.kind === "token_delta" || event.kind === "step_complete")
        && !sessions.some((entry) => entry.id === event.session_id)
      ) {
        sessions = upsertSession(sessions, {
          id: event.session_id,
          agent_id: event.agent_id,
          agent_name: event.agent_id,
          source: "meeting",
          brain_layer: "meeting",
          brain_label: "live",
          transport: "api",
          status: "active",
          started_at: event.timestamp,
        });
      }
      if (event.kind === "token_delta") {
        sessions = sessions.map((entry) =>
          entry.id === event.session_id && entry.status !== "active"
            ? { ...entry, status: "active" as const }
            : entry,
        );
      }
      syncRuntimeRef(sessions);
      const liveBuffers = { ...state.liveBuffers };
      if (event.kind === "token_delta" || event.kind === "terminal_line") {
        const chunk = event.content_delta ?? "";
        liveBuffers[event.session_id] = `${liveBuffers[event.session_id] ?? ""}${chunk}`;
      }
      if (event.kind === "step_complete" && event.content_full) {
        liveBuffers[event.session_id] = event.content_full;
      }
      if (event.kind === "error" && event.content_full) {
        liveBuffers[event.session_id] =
          `${liveBuffers[event.session_id] ?? ""}\n\n[error] ${event.content_full}`.trim();
      }
      return { events, sessions, liveBuffers };
    }),
  selectAgent: (agentId) => set({ selectedAgentId: agentId, filterAgentId: agentId }),
  selectSession: (sessionId) => set({ selectedSessionId: sessionId }),
  setFilterAgent: (agentId) => set({ filterAgentId: agentId }),
  liveTextForSession: (sessionId) => get().liveBuffers[sessionId] ?? "",
}));