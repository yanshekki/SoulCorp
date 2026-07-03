import { useCallback, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { VipExecutivePanel, VIP_EXECUTIVE_SECTIONS } from "./VipExecutivePanel";

export function VipExecutivePage() {
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const [activeSection, setActiveSection] = useState<string>(VIP_EXECUTIVE_SECTIONS[0].id);
  const hasAccess = tierBenefits.custom_departments || tierBenefits.ai_co_ceo;

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="vip-executive-page">
      <header className="vip-executive-page-header">
        <div>
          <h2>VIP Executive</h2>
          <p className="muted">
            Custom departments with SOPs, agent reassignment, and an autonomous AI Co-CEO.
          </p>
        </div>
        <span className={`vip-tier-pill tier-${tierBenefits.tier}`}>{tierBenefits.tier.toUpperCase()}</span>
      </header>

      {!hasAccess ? (
        <div className="vip-executive-disabled-gate">
          <div className="vip-executive-disabled-card">
            <h3>Unlock executive tooling</h3>
            <p className="muted">
              VIP tier adds branded custom departments on campus and Aria Nexus — your AI Co-CEO
              who runs briefings, proposes directives, and can manage agents autonomously.
            </p>
            <ul className="vip-executive-disabled-list">
              <li>Custom department buildings with brand colors and SOPs</li>
              <li>Reassign agents across builtin and custom departments</li>
              <li>Spawn AI Co-CEO, run executive briefings, apply strategy directives</li>
              <li>Optional Co-CEO autonomy for ongoing agent management</li>
            </ul>
            <button type="button" className="primary-action" onClick={() => setActivePanel("tier")}>
              Upgrade on Pro / VIP
            </button>
          </div>
        </div>
      ) : (
        <div className="vip-executive-page-body">
          <nav className="vip-executive-page-nav" aria-label="Executive sections">
            {VIP_EXECUTIVE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`vip-executive-nav-btn${activeSection === section.id ? " active" : ""}`}
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="vip-executive-page-scroll">
            <VipExecutivePanel onSectionFocus={setActiveSection} />
          </div>
        </div>
      )}
    </div>
  );
}