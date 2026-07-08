import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { MarketplacePanel, MARKETPLACE_SECTIONS } from "./MarketplacePanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MarketplacePage() {
  const [activeSection, setActiveSection] = useState<string>(MARKETPLACE_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Marketplace"
      subtitle="Gigs, contracts, payouts"
      badge={formatWorkflowStepBadge("marketplace")}
      navItems={MARKETPLACE_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="marketplace" />}
    >
      <MarketplacePanel onSectionFocus={setActiveSection} onNavigateSection={scrollToSection} />
    </AppPageShell>
  );
}