import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { IS_V1, IS_V2 } from "../../../config/features";
import { useGameStore } from "../../../stores/gameStore";
import type { AgentRecord, CoCeoBriefing, CoCeoStatus } from "../../../types/game";
import { sendCoCeoDirectiveToStae } from "../../../services/scrumClient";
import { notifyScrumChanged } from "../../../utils/scrumSync";

interface CoCeoPanelProps {
  onChanged?: () => void;
}

export function CoCeoPanel({ onChanged }: CoCeoPanelProps) {
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const [coCeoStatus, setCoCeoStatus] = useState<CoCeoStatus | null>(null);
  const [briefing, setBriefing] = useState<CoCeoBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [companyVision, setCompanyVision] = useState("");
  const [savingVision, setSavingVision] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await invoke<CoCeoStatus>("get_co_ceo_status");
      setCoCeoStatus(status);
    } catch (error) {
      setStatusMessage(String(error));
    }
  }, [setStatusMessage]);

  const refreshVision = useCallback(async () => {
    try {
      const status = await invoke<{ company_vision: string }>("get_automation_status");
      setCompanyVision(status.company_vision ?? "");
    } catch {
      setCompanyVision("");
    }
  }, []);

  useEffect(() => {
    if (activeCompanyId) {
      void refreshStatus();
      void refreshVision();
    }
  }, [activeCompanyId, refreshStatus, refreshVision]);

  const saveVision = async () => {
    setSavingVision(true);
    try {
      const result = await invoke<{ company_vision: string }>("update_company_vision", {
        request: { vision: companyVision },
      });
      setCompanyVision(result.company_vision);
      setStatusMessage("Company vision updated.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setSavingVision(false);
    }
  };

  const spawnCoCeo = async () => {
    try {
      const status = await invoke<CoCeoStatus>("spawn_co_ceo");
      setCoCeoStatus(status);
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      setStatusMessage("AI Co-CEO Aria Nexus is active.");
      onChanged?.();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const runBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const result = await invoke<CoCeoBriefing>("run_co_ceo_briefing");
      setBriefing(result);
      await refreshStatus();
      setStatusMessage(`Co-CEO briefing ready via ${result.provider}.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setLoadingBriefing(false);
    }
  };

  const sendToStae = async (directive: CoCeoBriefing["directives"][number]) => {
    try {
      await sendCoCeoDirectiveToStae({
        title: directive.title,
        description: directive.description,
        target_department: directive.target_department,
      });
      notifyScrumChanged();
      setStatusMessage(`Directive queued: ${directive.title}`);
      onChanged?.();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const applyDirective = async (directiveId: string, directive: CoCeoBriefing["directives"][number]) => {
    try {
      const status = await invoke<CoCeoStatus>("apply_co_ceo_directive", {
        request: {
          directive_id: directiveId,
          title: directive.title,
          description: directive.description,
          target_department: directive.target_department,
          project_progress_delta: directive.project_progress_delta,
          morale_delta: directive.morale_delta,
        },
      });
      setCoCeoStatus(status);
      setStatusMessage(`Applied directive: ${directive.title}`);
      onChanged?.();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const toggleAutonomy = async (enabled: boolean) => {
    try {
      const status = await invoke<CoCeoStatus>("set_co_ceo_autonomy", { enabled });
      setCoCeoStatus(status);
      setStatusMessage(enabled ? "Co-CEO autonomy enabled." : "Co-CEO autonomy paused.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="command-co-ceo-panel">
      <p className="muted">Aria Nexus — strategy briefings and directives into your backlog.</p>
      {IS_V1 ? (
        <p className="muted command-co-ceo-v1-hint">
          V1 background automation is controlled in <strong>Policies → Enable orchestrator</strong>.
          Use briefings here to manually queue directives; the worker issues them automatically when
          orchestrator is on.
        </p>
      ) : null}

      <div className="command-form-section">
        <h4>Company vision</h4>
        <p className="muted">
          Guides orchestrator briefings and rule-based directives when LLM is unavailable.
        </p>
        <label className="field-label">
          Vision statement
          <textarea
            rows={3}
            value={companyVision}
            onChange={(e) => setCompanyVision(e.target.value)}
            placeholder="e.g. Become the default AI operations layer for indie SaaS teams."
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void saveVision()}
          disabled={savingVision}
        >
          {savingVision ? "Saving…" : "Save vision"}
        </button>
      </div>

      {coCeoStatus ? (
        <div className="analytics-grid vip-executive-overview-grid">
          <article>
            <strong>{coCeoStatus.spawned ? "Active" : "Not spawned"}</strong>
            <span>Status</span>
          </article>
          <article>
            <strong>{coCeoStatus.agent_name ?? "—"}</strong>
            <span>Agent</span>
          </article>
          <article>
            <strong>{coCeoStatus.directives_applied}</strong>
            <span>Applied</span>
          </article>
          {IS_V2 ? (
            <article>
              <strong>{coCeoStatus.autonomy_enabled ? "On" : "Off"}</strong>
              <span>Autonomy</span>
            </article>
          ) : null}
        </div>
      ) : null}

      <div className="panel-actions vip-executive-actions">
        {!coCeoStatus?.spawned ? (
          <button type="button" className="btn btn--primary" onClick={() => void spawnCoCeo()}>
            Spawn AI Co-CEO
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void runBriefing()}
              disabled={loadingBriefing}
            >
              {loadingBriefing ? "Generating…" : "Run briefing"}
            </button>
            {IS_V2 ? (
              <button type="button" className="btn" onClick={() => void toggleAutonomy(!coCeoStatus?.autonomy_enabled)}>
                {coCeoStatus?.autonomy_enabled ? "Pause autonomy" : "Enable autonomy"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {briefing ? (
        <div className="co-ceo-briefing vip-executive-briefing">
          <p>{briefing.summary}</p>
          <p className="muted">Provider: {briefing.provider}</p>
          <div className="directive-list vip-executive-directive-grid">
            {briefing.directives.map((directive) => (
              <article key={directive.id} className="directive-card">
                <header>
                  <strong>{directive.title}</strong>
                  <span>{directive.target_department}</span>
                </header>
                <p>{directive.description}</p>
                <div className="panel-actions">
                  {IS_V2 ? (
                    <button type="button" className="btn" onClick={() => void applyDirective(directive.id, directive)}>
                      Apply morale
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--primary" onClick={() => void sendToStae(directive)}>
                    Add directive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}