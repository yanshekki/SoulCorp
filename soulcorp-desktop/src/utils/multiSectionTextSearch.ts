import { findTextMatches, pageIndexForMatchAt } from "./textSearch";

export type ExecutionTextSectionId = "error" | "summary" | "deliverable";

export interface ExecutionTextSection {
  id: ExecutionTextSectionId;
  label: string;
  text: string;
}

export interface GlobalTextMatch {
  sectionId: ExecutionTextSectionId;
  sectionMatchIndex: number;
  globalIndex: number;
}

export function findGlobalTextMatches(
  sections: ExecutionTextSection[],
  query: string,
): GlobalTextMatch[] {
  const matches: GlobalTextMatch[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    const sectionMatches = findTextMatches(section.text, query);
    sectionMatches.forEach((_, sectionMatchIndex) => {
      matches.push({
        sectionId: section.id,
        sectionMatchIndex,
        globalIndex,
      });
      globalIndex += 1;
    });
  }

  return matches;
}

export function sectionMatchSummary(
  sections: ExecutionTextSection[],
  query: string,
): { id: ExecutionTextSectionId; label: string; count: number }[] {
  return sections
    .map((section) => ({
      id: section.id,
      label: section.label,
      count: findTextMatches(section.text, query).length,
    }))
    .filter((entry) => entry.count > 0);
}

export function pageForGlobalMatch(
  sections: ExecutionTextSection[],
  query: string,
  match: GlobalTextMatch,
): number {
  const section = sections.find((entry) => entry.id === match.sectionId);
  if (!section) {
    return 0;
  }
  return pageIndexForMatchAt(section.text, query, match.sectionMatchIndex);
}