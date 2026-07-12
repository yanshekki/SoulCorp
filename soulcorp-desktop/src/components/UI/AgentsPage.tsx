import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { useGameStore } from "../../stores/gameStore";
import { useCompanyDepartments } from "../../hooks/useCompanyDepartments";
import { AppPageShell } from "./AppPageShell";
import { AgentsPanel, AGENTS_SECTIONS } from "./AgentsPanel";
import { TeamBudgetKpiRow, TeamBudgetPageBody } from "./TeamBudgetPageChrome";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function AgentsPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(AGENTS_SECTIONS[0].id);
  const agentCount = useGameStore((state) => state.agentRecords.length);
  const { departmentNames } = useCompanyDepartments();
  const withRuntime = useGameStore(
    (state) => state.agentRecords.filter((a) => a.agent_runtime_mode || a.ai_provider).length,
  );

  const segments = useMemo(() => mapSections(t, "agents", AGENTS_SECTIONS), [t]);

  const kpis = useMemo(
    () => [
      { label: t("nav.agents"), value: agentCount },
      { label: t("dept.teams"), value: departmentNames.length },
      { label: t("agents.section.runtime"), value: withRuntime },
    ],
    [agentCount, departmentNames.length, t, withRuntime],
  );

  return (
    <AppPageShell
      title={t("page.agents.title")}
      subtitle={t("page.agents.subtitle")}
      badge={formatWorkflowStepBadge("agents")}
      headerAction={<WorkflowNextButton panel="agents" />}
      kpiRow={<TeamBudgetKpiRow items={kpis} />}
    >
      <TeamBudgetPageBody
        segments={segments}
        activeId={activeSection}
        onSelect={setActiveSection}
        denseSegments
        ariaLabel={t("page.agents.title")}
      >
        <AgentsPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
      </TeamBudgetPageBody>
    </AppPageShell>
  );
}
