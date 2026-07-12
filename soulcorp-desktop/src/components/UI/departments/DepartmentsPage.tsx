import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanyDepartments } from "../../../hooks/useCompanyDepartments";
import { useGameStore } from "../../../stores/gameStore";
import { formatWorkflowStepBadge } from "../../../config/navigation";
import { applyBuildingsVisualDesign } from "../../../utils/applyVisualDesign";
import { generateDepartmentsFromProjects } from "../../../services/departmentsClient";
import {
  finishProgress,
  reportLocalProgress,
  useProgressStore,
} from "../../../stores/progressStore";
import { confirmDialog } from "../../../utils/nativeDialog";
import { AppPageShell } from "../AppPageShell";
import { TeamBudgetKpiRow, TeamBudgetPageBody } from "../TeamBudgetPageChrome";
import { WorkflowNextButton } from "../WorkflowNextButton";
import { DepartmentsTab } from "./DepartmentsTab";
import { OrgChartTab } from "./OrgChartTab";
import { useI18n } from "../../../i18n/I18nProvider";
import { type DepartmentsTabId } from "./departmentUtils";

export function DepartmentsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<DepartmentsTabId>("teams");
  const [createMode, setCreateMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { departments, departmentNames, refresh, loading } = useCompanyDepartments();
  const agentCount = useGameStore((state) => state.agentRecords.length);
  const setBuildings = useGameStore((state) => state.setBuildings);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const visualDesign = useGameStore((state) => state.visualDesign);

  const totalMembers = useMemo(
    () => departments.reduce((sum, department) => sum + department.member_count, 0),
    [departments],
  );

  // Prefer Teams when org has no formal departments yet.
  useEffect(() => {
    if (!loading && departments.length === 0 && activeTab === "people") {
      setActiveTab("teams");
    }
  }, [loading, departments.length, activeTab]);

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

  const handleGenerateOrg = useCallback(async () => {
    if (generating) {
      return;
    }
    if (departments.length > 0) {
      const ok = await confirmDialog(t("dept.confirm.mergeGenerated"), {
        title: t("dept.generateStructure"),
        kind: "warning",
      });
      if (!ok) {
        return;
      }
    }
    const opId = "generate_departments_from_projects";
    setGenerating(true);
    setStatusMessage(t("dept.msg.generating"));
    reportLocalProgress(opId, t("dept.progress.generating"), -1, "llm");
    useProgressStore.getState().setLlmLiveOpen(true);
    try {
      const result = await generateDepartmentsFromProjects({ merge: true });
      await handleChanged();
      try {
        const { syncWorkspaceFoldersAfterOrgChange } = await import(
          "../../../services/workspaceClient"
        );
        await syncWorkspaceFoldersAfterOrgChange();
      } catch {
        // non-fatal
      }
      setActiveTab("teams");
      setCreateMode(false);
      setStatusMessage(result.message);
      finishProgress(opId, result.message, "done");
    } catch (error) {
      setStatusMessage(String(error));
      finishProgress(opId, String(error), "error");
    } finally {
      setGenerating(false);
    }
  }, [departments.length, generating, handleChanged, setStatusMessage, t]);

  return (
    <AppPageShell
      title={t("dept.pageTitle")}
      subtitle={t("dept.pageSubtitle")}
      badge={formatWorkflowStepBadge("departments")}
      headerAction={<WorkflowNextButton panel="departments" />}
      kpiRow={
        <TeamBudgetKpiRow
          items={[
            { label: t("dept.teams"), value: departments.length },
            { label: t("dept.people"), value: totalMembers },
            { label: t("nav.agents"), value: agentCount },
          ]}
        />
      }
    >
      <TeamBudgetPageBody
        segments={[
          { id: "teams", label: t("dept.teams"), hint: t("dept.teamsHint") },
          { id: "people", label: t("dept.people"), hint: t("dept.peopleHint") },
        ]}
        activeId={activeTab}
        onSelect={(id) => {
          setActiveTab(id as DepartmentsTabId);
          if (id === "people") setCreateMode(false);
        }}
        ariaLabel={t("dept.pageTitle")}
      >
        {loading && departments.length === 0 ? (
          <div className="dept-empty-state">
            <p className="muted">{t("common.loading")}</p>
          </div>
        ) : activeTab === "teams" ? (
          <DepartmentsTab
            departments={departments}
            onChanged={handleChanged}
            createMode={createMode}
            onCreateModeChange={setCreateMode}
            onGenerateOrg={() => void handleGenerateOrg()}
            generating={generating}
          />
        ) : (
          <OrgChartTab departmentOptions={departmentNames} onChanged={handleChanged} />
        )}
      </TeamBudgetPageBody>
    </AppPageShell>
  );
}
