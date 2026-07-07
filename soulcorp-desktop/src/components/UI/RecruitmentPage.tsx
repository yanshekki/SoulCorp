import { useCallback, useState } from "react";
import { AppPageShell } from "./AppPageShell";
import { RecruitmentPanel, RECRUITMENT_SECTIONS } from "./RecruitmentPanel";

export function RecruitmentPage() {
  const [activeSection, setActiveSection] = useState<string>(RECRUITMENT_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Recruitment"
      subtitle="Hire & onboard agents"
      badge="Step 4"
      navItems={RECRUITMENT_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
    >
      <RecruitmentPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}