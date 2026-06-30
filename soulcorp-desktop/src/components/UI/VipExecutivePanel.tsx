import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import type {
  AgentRecord,
  CoCeoBriefing,
  CoCeoStatus,
  CompanyDepartmentsSnapshot,
  CustomDepartmentBuilding,
} from "../../types/game";
import type { Building } from "../../types/world";

function toWorldBuilding(building: CustomDepartmentBuilding): Building {
  return {
    id: building.id,
    name: building.name,
    department: building.department,
    position: building.position,
    size: building.size,
    color: building.color,
    roofColor: building.roof_color,
    accentColor: building.accent_color,
    description: building.description,
  };
}

export function VipExecutivePanel() {
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const buildings = useGameStore((state) => state.buildings);
  const setBuildings = useGameStore((state) => state.setBuildings);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  const [departments, setDepartments] = useState<CompanyDepartmentsSnapshot | null>(null);
  const [coCeoStatus, setCoCeoStatus] = useState<CoCeoStatus | null>(null);
  const [briefing, setBriefing] = useState<CoCeoBriefing | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const [deptName, setDeptName] = useState("");
  const [deptDisplayName, setDeptDisplayName] = useState("");
  const [deptSop, setDeptSop] = useState("");
  const [deptBrandColor, setDeptBrandColor] = useState("#6d7f9b");
  const [deptAccentColor, setDeptAccentColor] = useState("#5ec8ff");
  const [assignAgentId, setAssignAgentId] = useState("agent-1");
  const [targetDepartment, setTargetDepartment] = useState("Engineering");

  const refresh = async () => {
    try {
      const [deptSnapshot, status] = await Promise.all([
        invoke<CompanyDepartmentsSnapshot>("list_company_departments"),
        invoke<CoCeoStatus>("get_co_ceo_status"),
      ]);
      setDepartments(deptSnapshot);
      setCoCeoStatus(status);

      const baseIds = new Set(["hq", "engineering", "hr", "plaza"]);
      const merged = [
        ...buildings.filter((building) => baseIds.has(building.id)),
        ...deptSnapshot.buildings.map(toWorldBuilding),
      ];
      setBuildings(merged);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  useEffect(() => {
    if (tierBenefits.custom_departments || tierBenefits.ai_co_ceo) {
      void refresh();
    }
  }, [tierBenefits.custom_departments, tierBenefits.ai_co_ceo]);

  const deleteDepartment = async (departmentId: string) => {
    try {
      const snapshot = await invoke<CompanyDepartmentsSnapshot>("delete_custom_department", {
        department_id: departmentId,
      });
      setDepartments(snapshot);
      const baseIds = new Set(["hq", "engineering", "hr", "plaza"]);
      setBuildings([
        ...buildings.filter((building) => baseIds.has(building.id)),
        ...snapshot.buildings.map(toWorldBuilding),
      ]);
      setStatusMessage("Custom department removed.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const createDepartment = async () => {
    try {
      const snapshot = await invoke<CompanyDepartmentsSnapshot>("create_custom_department", {
        request: {
          name: deptName,
          display_name: deptDisplayName,
          sop: deptSop,
          brand_color: deptBrandColor,
          accent_color: deptAccentColor,
        },
      });
      setDepartments(snapshot);
      setBuildings([
        ...buildings.filter((building) => !building.id.startsWith("custom-")),
        ...snapshot.buildings.map(toWorldBuilding),
      ]);
      setDeptName("");
      setDeptDisplayName("");
      setDeptSop("");
      setStatusMessage(`Created custom department: ${deptDisplayName || deptName}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAssignDepartment = async () => {
    try {
      const agent = await invoke<AgentRecord>("assign_agent_department", {
        request: { agent_id: assignAgentId, department: targetDepartment },
      });
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      setStatusMessage(`${agent.name} moved to ${agent.department}.`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const spawnCoCeo = async () => {
    try {
      const status = await invoke<CoCeoStatus>("spawn_co_ceo");
      setCoCeoStatus(status);
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      setStatusMessage("AI Co-CEO Aria Nexus is now active in Executive.");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const runBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const result = await invoke<CoCeoBriefing>("run_co_ceo_briefing");
      setBriefing(result);
      const status = await invoke<CoCeoStatus>("get_co_ceo_status");
      setCoCeoStatus(status);
      setStatusMessage(`Co-CEO briefing ready via ${result.provider}.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setLoadingBriefing(false);
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

  if (!tierBenefits.custom_departments && !tierBenefits.ai_co_ceo) {
    return (
      <section className="panel-card vip-executive-panel">
        <h2>VIP Executive</h2>
        <p className="muted">Upgrade to VIP to unlock custom departments and the AI Co-CEO.</p>
      </section>
    );
  }

  const allDepartments = [
    ...(departments?.builtin ?? []),
    ...(departments?.custom.map((department) => department.name) ?? []),
  ];

  return (
    <section className="panel-card vip-executive-panel">
      <h2>VIP Executive</h2>
      <p className="muted">
        Design branded departments with SOPs and deploy an AI Co-CEO that proposes strategy and
        manages agents autonomously.
      </p>

      {tierBenefits.custom_departments ? (
        <div className="vip-section">
          <h3>Custom departments</h3>
          {departments?.custom.length ? (
            <ul className="custom-dept-list">
              {departments.custom.map((department) => (
                <li key={department.id}>
                  <strong>{department.display_name}</strong>
                  <span>{department.name}</span>
                  <p className="muted">{department.sop || "No SOP yet."}</p>
                  <button
                    type="button"
                    className="tiny-btn delete-dept-btn"
                    onClick={() => void deleteDepartment(department.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No custom departments yet.</p>
          )}

          <div className="gig-form">
            <label className="field-label">
              Internal name
              <input value={deptName} onChange={(event) => setDeptName(event.target.value)} />
            </label>
            <label className="field-label">
              Display name
              <input
                value={deptDisplayName}
                onChange={(event) => setDeptDisplayName(event.target.value)}
              />
            </label>
            <label className="field-label">
              SOP / mission
              <textarea
                rows={3}
                value={deptSop}
                onChange={(event) => setDeptSop(event.target.value)}
              />
            </label>
            <label className="field-label">
              Brand color
              <input
                type="color"
                value={deptBrandColor}
                onChange={(event) => setDeptBrandColor(event.target.value)}
              />
            </label>
            <label className="field-label">
              Accent color
              <input
                type="color"
                value={deptAccentColor}
                onChange={(event) => setDeptAccentColor(event.target.value)}
              />
            </label>
            <button type="button" className="primary-action" onClick={() => void createDepartment()}>
              Create department
            </button>
          </div>

          <div className="assign-dept-row">
            <label className="field-label">
              Reassign agent
              <select value={assignAgentId} onChange={(event) => setAssignAgentId(event.target.value)}>
                {agentRecords.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Department
              <select
                value={targetDepartment}
                onChange={(event) => setTargetDepartment(event.target.value)}
              >
                {allDepartments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void handleAssignDepartment()}>
              Assign
            </button>
          </div>
        </div>
      ) : null}

      {tierBenefits.ai_co_ceo ? (
        <div className="vip-section">
          <h3>AI Co-CEO</h3>
          {coCeoStatus ? (
            <div className="analytics-grid">
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
                <span>Directives applied</span>
              </article>
              <article>
                <strong>{coCeoStatus.autonomy_enabled ? "On" : "Off"}</strong>
                <span>Autonomy</span>
              </article>
            </div>
          ) : null}

          <div className="panel-actions">
            {!coCeoStatus?.spawned ? (
              <button type="button" className="primary-action" onClick={() => void spawnCoCeo()}>
                Spawn AI Co-CEO
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => void runBriefing()}
                  disabled={loadingBriefing}
                >
                  {loadingBriefing ? "Generating briefing..." : "Run executive briefing"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleAutonomy(!coCeoStatus?.autonomy_enabled)}
                >
                  {coCeoStatus?.autonomy_enabled ? "Pause autonomy" : "Enable autonomy"}
                </button>
              </>
            )}
          </div>

          {briefing ? (
            <div className="co-ceo-briefing">
              <p>{briefing.summary}</p>
              <p className="muted">Provider: {briefing.provider}</p>
              <div className="directive-list">
                {briefing.directives.map((directive) => (
                  <article key={directive.id} className="directive-card">
                    <header>
                      <strong>{directive.title}</strong>
                      <span>{directive.target_department}</span>
                    </header>
                    <p>{directive.description}</p>
                    <button
                      type="button"
                      onClick={() => void applyDirective(directive.id, directive)}
                    >
                      Apply directive
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}