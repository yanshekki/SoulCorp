import { invoke } from "../../../utils/tauriInvoke";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IS_V1, IS_V2 } from "../../../config/features";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { useGameStore } from "../../../stores/gameStore";
import type { AgentRecord, CoCeoBriefing, CoCeoStatus } from "../../../types/game";
import { sendCoCeoDirectiveToStae } from "../../../services/scrumClient";
import { DIRECTIVE_TEXT_SEARCH_TYPES } from "../../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../../utils/searchTypeFilters";
import { notifyScrumChanged } from "../../../utils/scrumSync";
import { useI18n } from "../../../i18n/I18nProvider";
import { SearchableListToolbar } from "../SearchableListToolbar";

interface CoCeoPanelProps {
  onChanged?: () => void;
}

export function CoCeoPanel({ onChanged }: CoCeoPanelProps) {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const [coCeoStatus, setCoCeoStatus] = useState<CoCeoStatus | null>(null);
  const [briefing, setBriefing] = useState<CoCeoBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [companyVision, setCompanyVision] = useState("");
  const [savingVision, setSavingVision] = useState(false);
  const [directiveSearchQuery, setDirectiveSearchQuery] = useState("");
  const [directiveSearchType, setDirectiveSearchType] = useState(SEARCH_TYPE_ALL);
  const debouncedDirectiveQuery = useDebouncedValue(directiveSearchQuery);

  const filteredBriefingDirectives = useMemo(() => {
    if (!briefing) {
      return [];
    }
    return filterByScopedQuery(
      briefing.directives,
      debouncedDirectiveQuery,
      directiveSearchType,
      {
        all: (directive) => [
          directive.title,
          directive.description,
          directive.target_department,
          directive.id,
        ],
        title: (directive) => [directive.title],
        body: (directive) => [directive.description],
        source: (directive) => [directive.target_department, directive.id],
      },
    );
  }, [briefing, debouncedDirectiveQuery, directiveSearchType]);

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
      setStatusMessage(t("coCeo.msg.visionUpdated"));
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
      setStatusMessage(t("coCeo.msg.spawned"));
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
      setStatusMessage(t("coCeo.msg.briefingReady", { provider: result.provider }));
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
      setStatusMessage(t("coCeo.msg.directiveQueued", { title: directive.title }));
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
      setStatusMessage(t("coCeo.msg.directiveApplied", { title: directive.title }));
      onChanged?.();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const toggleAutonomy = async (enabled: boolean) => {
    try {
      const status = await invoke<CoCeoStatus>("set_co_ceo_autonomy", { enabled });
      setCoCeoStatus(status);
      setStatusMessage(enabled ? t("coCeo.msg.autonomyOn") : t("coCeo.msg.autonomyOff"));
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="command-co-ceo-panel">
      <p className="muted">{t("coCeo.lead")}</p>
      {IS_V1 ? (
        <p className="muted command-co-ceo-v1-hint">{t("coCeo.v1Hint")}</p>
      ) : null}

      <div className="command-form-section">
        <h4>{t("coCeo.companyVision")}</h4>
        <p className="muted">{t("coCeo.visionHelp")}</p>
        <label className="field-label">
          {t("coCeo.vision")}
          <textarea
            rows={3}
            value={companyVision}
            onChange={(e) => setCompanyVision(e.target.value)}
            placeholder={t("coCeo.visionPlaceholder")}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void saveVision()}
          disabled={savingVision}
        >
          {savingVision ? t("common.saving") : t("coCeo.saveVision")}
        </button>
      </div>

      {coCeoStatus ? (
        <div className="analytics-grid vip-executive-overview-grid">
          <article>
            <strong>{coCeoStatus.spawned ? t("coCeo.active") : t("coCeo.notSpawned")}</strong>
            <span>{t("coCeo.status")}</span>
          </article>
          <article>
            <strong>{coCeoStatus.agent_name ?? "—"}</strong>
            <span>{t("coCeo.agent")}</span>
          </article>
          <article>
            <strong>{coCeoStatus.directives_applied}</strong>
            <span>{t("coCeo.applied")}</span>
          </article>
          {IS_V2 ? (
            <article>
              <strong>{coCeoStatus.autonomy_enabled ? t("coCeo.on") : t("coCeo.off")}</strong>
              <span>{t("coCeo.autonomy")}</span>
            </article>
          ) : null}
        </div>
      ) : null}

      <div className="panel-actions vip-executive-actions">
        {!coCeoStatus?.spawned ? (
          <button type="button" className="btn btn--primary" onClick={() => void spawnCoCeo()}>
            {t("coCeo.spawn")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void runBriefing()}
              disabled={loadingBriefing}
            >
              {loadingBriefing ? t("coCeo.generating") : t("coCeo.runBriefing")}
            </button>
            {IS_V2 ? (
              <button type="button" className="btn" onClick={() => void toggleAutonomy(!coCeoStatus?.autonomy_enabled)}>
                {coCeoStatus?.autonomy_enabled ? t("coCeo.pauseAutonomy") : t("coCeo.enableAutonomy")}
              </button>
            ) : null}
          </>
        )}
      </div>

      {briefing ? (
        <div className="co-ceo-briefing vip-executive-briefing">
          <p>{briefing.summary}</p>
          <p className="muted">{t("coCeo.provider", { name: briefing.provider })}</p>
          <SearchableListToolbar
            query={directiveSearchQuery}
            onQueryChange={setDirectiveSearchQuery}
            placeholder={t("coCeo.searchBriefing")}
            ariaLabel={t("coCeo.searchBriefing")}
            matchCount={
              debouncedDirectiveQuery.trim() || directiveSearchType !== SEARCH_TYPE_ALL
                ? filteredBriefingDirectives.length
                : undefined
            }
            totalCount={briefing.directives.length}
            typeFilter={{
              value: directiveSearchType,
              onChange: setDirectiveSearchType,
              options: DIRECTIVE_TEXT_SEARCH_TYPES,
              ariaLabel: t("coCeo.filterFieldAria"),
              label: t("coCeo.filterField"),
            }}
          />
          {debouncedDirectiveQuery.trim() && filteredBriefingDirectives.length === 0 ? (
            <p className="search-empty-hint muted">
              {t("coCeo.noMatches", { query: debouncedDirectiveQuery })}
            </p>
          ) : null}
          <div className="directive-list vip-executive-directive-grid">
            {filteredBriefingDirectives.map((directive) => (
              <article key={directive.id} className="directive-card">
                <header>
                  <strong>{directive.title}</strong>
                  <span>{directive.target_department}</span>
                </header>
                <p>{directive.description}</p>
                <div className="panel-actions">
                  {IS_V2 ? (
                    <button type="button" className="btn" onClick={() => void applyDirective(directive.id, directive)}>
                      {t("coCeo.applyMorale")}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn--primary" onClick={() => void sendToStae(directive)}>
                    {t("coCeo.addDirective")}
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