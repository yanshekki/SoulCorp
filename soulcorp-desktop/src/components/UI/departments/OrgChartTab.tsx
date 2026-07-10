import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../../stores/gameStore";
import { getOrgChart, updateAgentOrg } from "../../../services/departmentsClient";
import type { OrgChartNode, OrgChartSnapshot } from "../../../types/game";
import { formatAgentOptionLabel } from "../../../utils/agentLabel";
import { agentInitials, countTreeNodes, flattenOrgNodes } from "./departmentUtils";
import { OrgTreeNode } from "./OrgTreeNode";

interface OrgChartTabProps {
  departmentOptions: string[];
  onChanged: () => Promise<void>;
}

export function OrgChartTab({ departmentOptions, onChanged }: OrgChartTabProps) {
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
      setStatusMessage("Reporting line updated.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  if (!chart) {
    return (
      <div className="dept-empty-state">
        <p className="muted">Load a company to design your org chart.</p>
      </div>
    );
  }

  const treeCount = countTreeNodes(chart.roots);

  return (
    <div className="dept-split-layout">
      <section className="dept-split-main">
        <header className="dept-panel-toolbar">
          <div>
            <h3>Reporting tree</h3>
            <p className="muted">
              {treeCount} in hierarchy
              {chart.unassigned.length > 0 ? ` · ${chart.unassigned.length} need manager` : ""}
            </p>
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
            <p>No top-level leaders yet. Select an agent on the right to set their manager.</p>
          </div>
        )}

        {chart.unassigned.length > 0 ? (
          <div className="dept-org-unassigned">
            <h4>Needs reporting line</h4>
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
            <p className="dept-side-placeholder-title">Select an agent</p>
            <p className="muted">Click someone in the tree to edit their department and reporting line.</p>
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
  return (
    <div className="dept-agent-inspector">
      <header className="dept-agent-inspector-header">
        <span className="dept-org-avatar dept-org-avatar--large">{agentInitials(node.name)}</span>
        <div>
          <h3>{node.name}</h3>
          <p className="muted">{node.role}</p>
        </div>
        <button type="button" className="tiny-btn" onClick={onClose} aria-label="Close">
          Close
        </button>
      </header>

      <div className="dept-agent-inspector-meta">
        <span className="dept-org-pill">{node.department}</span>
        {node.manages_department ? (
          <span className="dept-meta-chip">Head of {node.manages_department}</span>
        ) : null}
        {node.children.length > 0 ? (
          <span className="dept-meta-chip">{node.children.length} direct reports</span>
        ) : null}
      </div>

      <label className="field-label">
        Department
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
        Reports to
        <select
          value={node.reports_to ?? ""}
          disabled={busy}
          onChange={(event) => void onUpdate({ reports_to: event.target.value || null })}
        >
          <option value="">Top level (no manager)</option>
          {managerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Manages department
        <select
          value={node.manages_department ?? ""}
          disabled={busy}
          onChange={(event) =>
            void onUpdate({ manages_department: event.target.value || null })
          }
        >
          <option value="">Not a department head</option>
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