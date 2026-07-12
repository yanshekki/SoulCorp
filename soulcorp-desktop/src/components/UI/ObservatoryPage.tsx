import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { useGameStore } from "../../stores/gameStore";
import { AppPageShell } from "./AppPageShell";
import { ObservatoryPanel, OBSERVATORY_SECTIONS } from "./observatory/ObservatoryPanel";
import { TeamBudgetKpiRow, TeamBudgetPageBody } from "./TeamBudgetPageChrome";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function ObservatoryPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(OBSERVATORY_SECTIONS[0].id);
  const agentCount = useGameStore((state) => state.agentRecords.length);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const liveBuffers = useAgentActivityStore((state) => state.liveBuffers);

  const segments = useMemo(() => mapSections(t, "observatory", OBSERVATORY_SECTIONS), [t]);

  const activeThinking = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );
  const streamChars = useMemo(() => {
    let total = 0;
    for (const session of sessions) {
      if (session.status === "active") {
        total += liveBuffers[session.id]?.length ?? 0;
      }
    }
    return total;
  }, [sessions, liveBuffers]);

  const kpis = useMemo(
    () => [
      { label: t("observatory.section.live"), value: activeThinking },
      { label: t("nav.agents"), value: agentCount },
      {
        label: t("observatory.section.stream"),
        value: streamChars > 0 ? `${Math.round(streamChars / 100) / 10}k` : "—",
      },
    ],
    [activeThinking, agentCount, streamChars, t],
  );

  return (
    <AppPageShell
      title={t("page.observatory.title")}
      subtitle={t("page.observatory.subtitle")}
      badge={formatWorkflowStepBadge("observatory")}
      headerAction={<WorkflowNextButton panel="observatory" />}
      kpiRow={<TeamBudgetKpiRow items={kpis} />}
    >
      <TeamBudgetPageBody
        segments={segments}
        activeId={activeSection}
        onSelect={setActiveSection}
        ariaLabel={t("page.observatory.title")}
      >
        <ObservatoryPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
      </TeamBudgetPageBody>
    </AppPageShell>
  );
}
