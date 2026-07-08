import { useCallback, useState } from "react";
import { AppPageShell } from "./AppPageShell";
import { ObservatoryPanel, OBSERVATORY_SECTIONS } from "./observatory/ObservatoryPanel";

export function ObservatoryPage() {
  const [activeSection, setActiveSection] = useState<string>(OBSERVATORY_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Observatory"
      subtitle="Live agent work & thought streams"
      navItems={OBSERVATORY_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
    >
      <ObservatoryPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}