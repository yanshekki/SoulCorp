import { useState } from "react";
import { AppPageShell } from "./AppPageShell";
import { AchievementsPanel, ACHIEVEMENT_NAV_SECTIONS } from "./AchievementsPanel";

export function AchievementsPage() {
  const [activeSection, setActiveSection] = useState<string>("all");

  return (
    <AppPageShell
      title="Achievements"
      subtitle="Milestones and endings"
      navItems={ACHIEVEMENT_NAV_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
    >
      <AchievementsPanel activeSection={activeSection} />
    </AppPageShell>
  );
}
