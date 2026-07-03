import { useCallback, useState } from "react";
import { MarketplacePanel, MARKETPLACE_SECTIONS } from "./MarketplacePanel";

export function MarketplacePage() {
  const [activeSection, setActiveSection] = useState<string>(MARKETPLACE_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="marketplace-page">
      <header className="marketplace-page-header">
        <div>
          <h2>Marketplace</h2>
          <p className="muted">
            Post gigs to soulmd-hub, accept contracts, deliver work through QC, and collect USDT
            payouts after approval.
          </p>
        </div>
      </header>

      <div className="marketplace-page-body">
        <nav className="marketplace-page-nav" aria-label="Marketplace sections">
          {MARKETPLACE_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`marketplace-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="marketplace-page-scroll">
          <MarketplacePanel
            onSectionFocus={setActiveSection}
            onNavigateSection={scrollToSection}
          />
        </div>
      </div>
    </div>
  );
}