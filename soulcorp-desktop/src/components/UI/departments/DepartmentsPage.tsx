import { useCallback, useMemo, useState } from "react";
import { useCompanyDepartments } from "../../../hooks/useCompanyDepartments";
import { useGameStore } from "../../../stores/gameStore";
import { applyBuildingsVisualDesign } from "../../../utils/applyVisualDesign";
import { AppPageShell } from "../AppPageShell";
import { DepartmentsTab } from "./DepartmentsTab";
import { OrgChartTab } from "./OrgChartTab";
import type { DepartmentsTabId } from "./departmentUtils";

const TABS: Array<{ id: DepartmentsTabId; label: string; hint: string }> = [
  { id: "org", label: "Org chart", hint: "Reporting lines" },
  { id: "departments", label: "Departments", hint: "Teams & SOPs" },
];

export function DepartmentsPage() {
  const [activeTab, setActiveTab] = useState<DepartmentsTabId>("org");
  const [createMode, setCreateMode] = useState(false);
  const { departments, departmentNames, refresh, loading } = useCompanyDepartments();
  const agentCount = useGameStore((state) => state.agentRecords.length);
  const setBuildings = useGameStore((state) => state.setBuildings);
  const visualDesign = useGameStore((state) => state.visualDesign);

  const totalMembers = useMemo(
    () => departments.reduce((sum, department) => sum + department.member_count, 0),
    [departments],
  );

  const handleChanged = useCallback(async () => {
    const snapshot = await refresh();
    if (snapshot?.buildings?.length) {
      const mapped = snapshot.buildings.map((building) => ({
        id: building.id,
        name: building.name,
        department: building.department,
        position: building.position,
        size: building.size,
        color: building.color,
        roofColor: building.roof_color,
        accentColor: building.accent_color,
        description: building.description,
      }));
      setBuildings(applyBuildingsVisualDesign(mapped, visualDesign));
    }
  }, [refresh, setBuildings, visualDesign]);

  const selectTab = useCallback((tabId: string) => {
    const next = tabId as DepartmentsTabId;
    setActiveTab(next);
    if (next === "org") setCreateMode(false);
  }, []);

  return (
    <AppPageShell
      title="Departments"
      subtitle="Teams & reporting lines"
      navItems={TABS.map((tab) => ({ id: tab.id, label: tab.label, hint: tab.hint }))}
      activeNavId={activeTab}
      onNavSelect={selectTab}
      headerAction={
        activeTab === "departments" ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setCreateMode(true);
              setActiveTab("departments");
            }}
          >
            Add department
          </button>
        ) : null
      }
      kpiRow={
        <div className="kpi-grid">
          <article>
            <span className="muted">Departments</span>
            <strong>{departments.length}</strong>
          </article>
          <article>
            <span className="muted">Assigned</span>
            <strong>{totalMembers}</strong>
          </article>
          <article>
            <span className="muted">Agents</span>
            <strong>{agentCount}</strong>
          </article>
        </div>
      }
    >
      {loading && departments.length === 0 ? (
        <div className="dept-empty-state">
          <p className="muted">Loading…</p>
        </div>
      ) : activeTab === "org" ? (
        <OrgChartTab departmentOptions={departmentNames} onChanged={handleChanged} />
      ) : (
        <DepartmentsTab
          departments={departments}
          onChanged={handleChanged}
          createMode={createMode}
          onCreateModeChange={setCreateMode}
        />
      )}
    </AppPageShell>
  );
}