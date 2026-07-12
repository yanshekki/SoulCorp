import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { AppPageShell } from "./AppPageShell";
import { MarketplacePanel, MARKETPLACE_SECTIONS } from "./MarketplacePanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MarketplacePage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(MARKETPLACE_SECTIONS[0].id);
  const navItems = useMemo(() => mapSections(t, "marketplace", MARKETPLACE_SECTIONS), [t]);

  return (
    <AppPageShell
      title={t("page.marketplace.title")}
      subtitle={t("page.marketplace.subtitle")}
      badge={formatWorkflowStepBadge("marketplace")}
      navItems={navItems.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="marketplace" />}
    >
      <MarketplacePanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
