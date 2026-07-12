import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import { AppPageShell } from "./AppPageShell";
import { FinancePanel, TOKENS_SECTIONS } from "./FinancePanel";
import { TeamBudgetKpiRow, TeamBudgetPageBody } from "./TeamBudgetPageChrome";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function TokensPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(TOKENS_SECTIONS[0].id);
  const finance = useGameStore((state) => state.finance);
  const agentCount = useGameStore((state) => state.agentRecords.length);

  const pool = useMemo(() => totalCompanyTokens(finance), [finance]);
  const agentWallets = useMemo(
    () => Object.keys(finance?.agents ?? {}).length,
    [finance],
  );

  const segments = useMemo(() => mapSections(t, "tokens", TOKENS_SECTIONS), [t]);

  const kpis = useMemo(
    () => [
      {
        label: t("tokens.section.overview"),
        value: pool >= 1_000_000 ? `${Math.round(pool / 1000)}k` : pool.toLocaleString(),
      },
      { label: t("tokens.section.agents"), value: agentWallets || agentCount },
      {
        label: t("tokens.section.allocation"),
        value: segments.find((s) => s.id === activeSection)?.label ?? "—",
      },
    ],
    [activeSection, agentCount, agentWallets, pool, segments, t],
  );

  return (
    <AppPageShell
      title={t("page.tokens.title")}
      subtitle={t("page.tokens.subtitle")}
      badge={formatWorkflowStepBadge("finance")}
      headerAction={<WorkflowNextButton panel="finance" />}
      kpiRow={<TeamBudgetKpiRow items={kpis} />}
    >
      <TeamBudgetPageBody
        segments={segments}
        activeId={activeSection}
        onSelect={setActiveSection}
        denseSegments
        ariaLabel={t("page.tokens.title")}
      >
        <FinancePanel activeSection={activeSection} onNavigateSection={setActiveSection} />
      </TeamBudgetPageBody>
    </AppPageShell>
  );
}
