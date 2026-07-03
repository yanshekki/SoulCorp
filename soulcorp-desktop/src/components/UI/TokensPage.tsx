import { useCallback, useState } from "react";
import { FinancePanel, TOKENS_SECTIONS } from "./FinancePanel";

export function TokensPage() {
  const [activeSection, setActiveSection] = useState<string>(TOKENS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="tokens-page">
      <header className="tokens-page-header">
        <div>
          <h2>Tokens</h2>
          <p className="muted">
            Company token pool, budget split, department and agent wallets with period caps, usage
            ledger, and salary efficiency.
          </p>
        </div>
      </header>

      <div className="tokens-page-body">
        <nav className="tokens-page-nav" aria-label="Token sections">
          {TOKENS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`tokens-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="tokens-page-scroll">
          <FinancePanel onSectionFocus={setActiveSection} onNavigateSection={scrollToSection} />
        </div>
      </div>
    </div>
  );
}