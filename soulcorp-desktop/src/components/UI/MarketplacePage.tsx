import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { MarketplacePanel, MARKETPLACE_SECTIONS } from "./MarketplacePanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MarketplacePage() {
  const [activeSection, setActiveSection] = useState<string>(MARKETPLACE_SECTIONS[0].id);

  return (
    <AppPageShell
      title="Marketplace"
      subtitle="Gigs, contracts, payouts"
      badge={formatWorkflowStepBadge("marketplace")}
      navItems={MARKETPLACE_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="marketplace" />}
    >
      <MarketplacePanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
