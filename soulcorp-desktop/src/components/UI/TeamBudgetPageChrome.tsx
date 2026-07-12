import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider";

/** KPI chip for Team & Budget pages (shared chrome). */
export interface TeamBudgetKpi {
  label: string;
  value: string | number;
}

export interface TeamBudgetSegment {
  id: string;
  label: string;
  hint?: string;
}

interface TeamBudgetKpiRowProps {
  items: TeamBudgetKpi[];
}

/** Compact pill KPIs under the page header. */
export function TeamBudgetKpiRow({ items }: TeamBudgetKpiRowProps) {
  return (
    <div className="mgmt-kpi-row">
      {items.map((item) => (
        <article key={item.label} className="mgmt-kpi-chip">
          <span className="muted">{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

interface TeamBudgetSegmentsProps {
  segments: TeamBudgetSegment[];
  activeId: string;
  onSelect: (id: string) => void;
  /** When many sections, use denser equal columns (auto-fit). */
  dense?: boolean;
  ariaLabel?: string;
}

/**
 * Top segmented control for Team & Budget pages.
 * Replaces left app-page-nav for a single visual axis.
 */
export function TeamBudgetSegments({
  segments,
  activeId,
  onSelect,
  dense = false,
  ariaLabel,
}: TeamBudgetSegmentsProps) {
  const { t } = useI18n();
  const resolvedAria = ariaLabel ?? t("chrome.pageSections");
  const count = Math.min(Math.max(segments.length, 1), 6);
  return (
    <div
      className={`mgmt-page-segment${dense ? " mgmt-page-segment--dense" : ""}`}
      style={
        dense
          ? {
              gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
              maxWidth: count > 4 ? "100%" : undefined,
            }
          : segments.length === 2
            ? undefined
            : {
                gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                maxWidth: count <= 3 ? "42rem" : "100%",
              }
      }
      role="tablist"
      aria-label={resolvedAria}
    >
      {segments.map((segment) => (
        <button
          key={segment.id}
          type="button"
          role="tab"
          aria-selected={activeId === segment.id}
          className={`mgmt-page-segment-btn${activeId === segment.id ? " is-active" : ""}`}
          onClick={() => onSelect(segment.id)}
          title={segment.hint}
        >
          <span className="mgmt-page-segment-label">{segment.label}</span>
          {segment.hint ? (
            <span className="mgmt-page-segment-hint">{segment.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

interface TeamBudgetPageBodyProps {
  segments: TeamBudgetSegment[];
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  denseSegments?: boolean;
  ariaLabel?: string;
}

/** Segment strip + scrollable content — shared layout shell for Team & Budget. */
export function TeamBudgetPageBody({
  segments,
  activeId,
  onSelect,
  children,
  denseSegments,
  ariaLabel,
}: TeamBudgetPageBodyProps) {
  return (
    <div className="mgmt-page">
      <TeamBudgetSegments
        segments={segments}
        activeId={activeId}
        onSelect={onSelect}
        dense={denseSegments}
        ariaLabel={ariaLabel}
      />
      <div className="mgmt-page-content">{children}</div>
    </div>
  );
}
