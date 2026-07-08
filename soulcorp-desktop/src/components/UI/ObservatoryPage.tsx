import { useCallback, useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useAgentActivityStore } from "../../stores/agentActivityStore";
import { AppPageShell } from "./AppPageShell";
import { WorkflowNextButton } from "./WorkflowNextButton";
import { ObservatoryPanel, OBSERVATORY_SECTIONS } from "./observatory/ObservatoryPanel";

export function ObservatoryPage() {
  const [activeSection, setActiveSection] = useState<string>(OBSERVATORY_SECTIONS[0].id);
  const sessions = useAgentActivityStore((state) => state.sessions);
  const activeCount = useMemo(
    () => sessions.filter((session) => session.status === "active").length,
    [sessions],
  );

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const kpiRow = (
    <div className="kpi-grid">
      <article>
        <span>Live sessions</span>
        <strong>{activeCount}</strong>
      </article>
      <article>
        <span>Total sessions</span>
        <strong>{sessions.length}</strong>
      </article>
    </div>
  );

  return (
    <AppPageShell
      title="Observatory"
      subtitle="Watch agents think, plan, and execute in real time"
      badge={formatWorkflowStepBadge("observatory", activeCount > 0 ? `${activeCount} live` : undefined)}
      navItems={OBSERVATORY_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        hint: section.hint,
      }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="observatory" />}
      kpiRow={kpiRow}
    >
      <ObservatoryPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}