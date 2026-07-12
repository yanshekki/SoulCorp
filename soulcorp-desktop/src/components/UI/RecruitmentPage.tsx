import { useMemo } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";
import { AppPageShell } from "./AppPageShell";
import { RecruitmentPanel } from "./RecruitmentPanel";
import { TeamBudgetKpiRow, TeamBudgetPageBody } from "./TeamBudgetPageChrome";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function RecruitmentPage() {
  const { t } = useI18n();
  const agentCount = useGameStore((state) => state.agentRecords.length);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const pureLocal = useGameStore((state) => state.settings.pure_local_mode);

  const kpis = useMemo(
    () => [
      { label: t("recruitPage.roster"), value: agentCount },
      {
        label: t("recruitPage.hub"),
        value: pureLocal
          ? t("recruitPage.local")
          : hubStatus.connected
            ? t("recruitPage.online")
            : t("recruitPage.offline"),
      },
      { label: t("recruitPage.flow"), value: t("recruitPage.flowValue") },
    ],
    [agentCount, hubStatus.connected, pureLocal, t],
  );

  return (
    <AppPageShell
      title={t("recruitment.title")}
      subtitle={t("recruitment.subtitle")}
      badge={formatWorkflowStepBadge("recruitment")}
      headerAction={<WorkflowNextButton panel="recruitment" />}
      kpiRow={<TeamBudgetKpiRow items={kpis} />}
    >
      <TeamBudgetPageBody
        segments={[
          {
            id: "hire",
            label: t("recruitment.findHire"),
            hint: t("recruitment.findHire.hint"),
          },
        ]}
        activeId="hire"
        onSelect={() => undefined}
        ariaLabel={t("recruitment.title")}
      >
        <RecruitmentPanel activeSection="hire" />
      </TeamBudgetPageBody>
    </AppPageShell>
  );
}
