import { useCallback, useState } from "react";
import { AppPageShell } from "./AppPageShell";
import { AchievementsPanel, ACHIEVEMENT_NAV_SECTIONS } from "./AchievementsPanel";

export function AchievementsPage() {
  const [activeSection, setActiveSection] = useState<string>("all");

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === "all") {
      document.querySelector(".app-page-content")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Achievements"
      subtitle="Milestones & endings"
      navItems={ACHIEVEMENT_NAV_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
    >
      <AchievementsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}