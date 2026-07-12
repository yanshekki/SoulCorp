import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../../stores/gameStore";
import {
  assignOrgWithAi,
  getOrgChart,
  updateAgentOrg,
} from "../../../services/departmentsClient";
import type { AgentRecord, OrgChartNode, OrgChartSnapshot } from "../../../types/game";
import {
  finishProgress,
  reportLocalProgress,
  useProgressStore,
} from "../../../stores/progressStore";
import { formatAgentOptionLabel } from "../../../utils/agentLabel";
import { confirmDialog } from "../../../utils/nativeDialog";
import { invoke } from "../../../utils/tauriInvoke";
import { useI18n } from "../../../i18n/I18nProvider";
import { agentInitials, countTreeNodes, flattenOrgNodes } from "./departmentUtils";
import { OrgTreeNode } from "./OrgTreeNode";

interface OrgChartTabProps {
  departmentOptions: string[];
  onChanged: () => Promise<void>;
}

export function OrgChartTab({ departmentOptions, onChanged }: OrgChartTabProps) {
  const { t } = useI18n();
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [chart, setChart] = useState<OrgChartSnapshot | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshChart = useCallback(async () => {
    if (!activeCompanyId) {
      setChart(null);
      return;
    }
    setChart(await getOrgChart());
  }, [activeCompanyId]);

  // Only re-fetch when org structure changes — not on every agent status tick from the worker.
  const orgStructureKey = useMemo(
    () =>
      agentRecords
        .map(
          (agent) =>
            `${agent.id}|${agent.department}|${agent.reports_to ?? ""}|${agent.manages_department ?? ""}|${agent.name}`,
        )
        .sort()
        .join(";"),
    [agentRecords],
  );

  useEffect(() => {
    void refreshChart();
  }, [refreshChart, orgStructureKey]);

  const allNodes = useMemo(() => {
    if (!chart) return [];
    return [...flattenOrgNodes(chart.roots), ...chart.unassigned];
  }, [chart]);

  const selectedNode = useMemo(
    () => allNodes.find((node) => node.agent_id === selectedAgentId) ?? null,
    [allNodes, selectedAgentId],
  );

  const managerOptions = useMemo(
    () =>
      agentRecords
        .filter((agent) => agent.id !== selectedAgentId)
        .map((agent) => ({ id: agent.id, label: formatAgentOptionLabel(agent) })),
    [agentRecords, selectedAgentId],
  );

  const handleUpdate = async (patch: {
    department?: string;
    reports_to?: string | null;
    manages_department?: string | null;
  }) => {
    if (!selectedAgentId) return;
    setBusy(true);
    try {
      const updated = await updateAgentOrg({ agent_id: selectedAgentId, ...patch });
      setAgentRecords(agentRecords.map((agent) => (agent.id === updated.id ? updated : agent)));
      await refreshChart();
      await onChanged();
      setStatusMessage(t("dept.msg.reportingUpdated"));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleAssignOrgWithAi = async () => {
    if (busy) return;
    if (departmentOptions.length === 0) {
      setStatusMessage(t("dept.msg.needTeamsFirst"));
      return;
    }
    // Must await Tauri-native confirm — bare window.confirm is async and always truthy if not awaited.
    const ok = await confirmDialog(t("dept.confirm.reassignAll"), {
      title: t("dept.autoAssignPeople"),
      kind: "warning",
    });
    if (!ok) return;

    const opId = "assign_org_with_ai";
    setBusy(true);
    setStatusMessage(t("dept.msg.assigning"));
    reportLocalProgress(opId, t("dept.progress.assigning"), -1, "llm");
    useProgressStore.getState().setLlmLiveOpen(true);
    try {
      const result = await assignOrgWithAi();
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      setChart(result.snapshot);
      await onChanged();
      setSelectedAgentId(null);
      setStatusMessage(result.message);
      finishProgress(opId, result.message, "done");
    } catch (error) {
      setStatusMessage(String(error));
      finishProgress(opId, String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!chart) {
    return (
      <div className="dept-empty-state">
        <p className="muted">{t("dept.loadCompanyOrg")}</p>
      </div>
    );
  }

  const treeCount = countTreeNodes(chart.roots);

  return (
    <div className="dept-split-layout">
      <section className="dept-split-main">
        <header className="dept-context-toolbar">
          <div className="dept-context-toolbar-copy">
            <h3>{t("dept.people")}</h3>
            <p className="muted">
              {t("dept.inHierarchy", { n: treeCount })}
              {chart.unassigned.length > 0
                ? t("dept.needManager", { n: chart.unassigned.length })
                : ""}
            </p>
          </div>
          <div className="dept-context-toolbar-actions">
            <button
              type="button"
              className="dept-ai-btn dept-ai-btn--warn"
              disabled={busy}
              onClick={() => void handleAssignOrgWithAi()}
              title={t("dept.autoAssignTitle")}
            >
              {busy ? t("dept.autoAssignBusy") : t("dept.autoAssignPeople")}
            </button>
          </div>
        </header>

        {chart.roots.length > 0 ? (
          <ul className="dept-org-tree">
            {chart.roots.map((node) => (
              <OrgTreeNode
                key={node.agent_id}
                node={node}
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
              />
            ))}
          </ul>
        ) : (
          <div className="dept-empty-state dept-empty-state--inset">
            <p className="muted">
              {t("dept.noRoots")}
            </p>
          </div>
        )}

        {chart.unassigned.length > 0 ? (
          <div className="dept-org-unassigned">
            <h4>{t("dept.needsReporting")}</h4>
            <ul className="dept-org-tree dept-org-tree--flat">
              {chart.unassigned.map((node) => (
                <OrgTreeNode
                  key={node.agent_id}
                  node={node}
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <aside className="dept-split-side">
        {selectedNode ? (
          <AgentOrgInspector
            node={selectedNode}
            departmentOptions={departmentOptions}
            managerOptions={managerOptions}
            busy={busy}
            onUpdate={handleUpdate}
            onClose={() => setSelectedAgentId(null)}
          />
        ) : (
          <div className="dept-side-placeholder">
            <p className="dept-side-placeholder-title">{t("dept.selectPersonTitle")}</p>
            <p className="muted">{t("dept.selectPersonBody")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function AgentOrgInspector({
  node,
  departmentOptions,
  managerOptions,
  busy,
  onUpdate,
  onClose,
}: {
  node: OrgChartNode;
  departmentOptions: string[];
  managerOptions: Array<{ id: string; label: string }>;
  busy: boolean;
  onUpdate: (patch: {
    department?: string;
    reports_to?: string | null;
    manages_department?: string | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="dept-agent-inspector">
      <header className="dept-agent-inspector-header">
        <span className="dept-org-avatar dept-org-avatar--large">{agentInitials(node.name)}</span>
        <div>
          <h3>{node.name}</h3>
          <p className="muted">{node.role}</p>
        </div>
        <button type="button" className="tiny-btn" onClick={onClose} aria-label={t("dept.close")}>
          {t("dept.close")}
        </button>
      </header>

      <div className="dept-agent-inspector-meta">
        <span className="dept-org-pill">{node.department}</span>
        {node.manages_department ? (
          <span className="dept-meta-chip">{t("dept.headOf", { name: node.manages_department })}</span>
        ) : null}
        {node.children.length > 0 ? (
          <span className="dept-meta-chip">{t("dept.directReports", { n: node.children.length })}</span>
        ) : null}
      </div>

      <label className="field-label">
        {t("dept.department")}
        <select
          value={node.department}
          disabled={busy}
          onChange={(event) => void onUpdate({ department: event.target.value })}
        >
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        {t("dept.reportsTo")}
        <select
          value={node.reports_to ?? ""}
          disabled={busy}
          onChange={(event) => void onUpdate({ reports_to: event.target.value || null })}
        >
          <option value="">{t("dept.topLevel")}</option>
          {managerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        {t("dept.managesDept")}
        <select
          value={node.manages_department ?? ""}
          disabled={busy}
          onChange={(event) =>
            void onUpdate({ manages_department: event.target.value || null })
          }
        >
          <option value="">{t("dept.notDeptHead")}</option>
          {departmentOptions.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}