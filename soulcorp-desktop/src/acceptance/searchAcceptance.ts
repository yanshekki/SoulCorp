import { filterByQuery, tokenizeQuery } from "../utils/listSearch";
import { paginateItems, paginateText } from "../utils/pagination";
import {
  findGlobalTextMatches,
  pageForGlobalMatch,
  sectionMatchSummary,
} from "../utils/multiSectionTextSearch";
import { findTextMatches, pageIndexForMatchAt } from "../utils/textSearch";
import type { AcceptanceResult } from "./acceptanceTests";

interface SampleRun {
  id: string;
  status: string;
  agent_id: string;
  summary: string;
}

export function runSearchAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  const tokens = tokenizeQuery("  Hello   World  ");
  results.push({
    name: "Search tokenizeQuery trims and splits",
    passed: tokens.join("|") === "hello|world",
    detail: tokens.join("|"),
  });

  const items: SampleRun[] = [
    { id: "r1", status: "done", agent_id: "a1", summary: "Ship feature alpha" },
    { id: "r2", status: "failed", agent_id: "a2", summary: "Fix beta bug" },
  ];
  const filtered = filterByQuery(items, "alpha done", (item) => [
    item.id,
    item.status,
    item.agent_id,
    item.summary,
  ]);
  results.push({
    name: "Search filterByQuery AND matches multiple fields",
    passed: filtered.length === 1 && filtered[0]?.id === "r1",
    detail: String(filtered.length),
  });

  const longText = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n");
  const pages = paginateText(longText, 32);
  results.push({
    name: "Search paginateText splits long output",
    passed: pages.length === 2,
    detail: String(pages.length),
  });

  const paged = paginateItems(items, 0, 1);
  results.push({
    name: "Search paginateItems returns one item per page",
    passed: paged.pageItems.length === 1 && paged.totalPages === 2,
    detail: `${paged.pageItems.length}/${paged.totalPages}`,
  });

  const haystack = "alpha beta alpha";
  const matches = findTextMatches(haystack, "alpha");
  results.push({
    name: "Search findTextMatches finds repeated terms",
    passed: matches.length === 2,
    detail: String(matches.length),
  });

  const pageIndex = pageIndexForMatchAt(longText, "line 33", 0);
  results.push({
    name: "Search pageIndexForMatchAt jumps to later page",
    passed: pageIndex === 1,
    detail: String(pageIndex),
  });

  const sections = [
    { id: "error" as const, label: "Error", text: "timeout in worker" },
    { id: "summary" as const, label: "Summary", text: "worker recovered" },
    { id: "deliverable" as const, label: "Deliverable", text: "final worker output" },
  ];
  const globalMatches = findGlobalTextMatches(sections, "worker");
  const summary = sectionMatchSummary(sections, "worker");
  const firstPage = pageForGlobalMatch(sections, "worker", globalMatches[0]!);
  results.push({
    name: "Search global matches span all sections",
    passed: globalMatches.length === 3 && summary.length === 3,
    detail: String(globalMatches.length),
  });
  results.push({
    name: "Search global match resolves page index",
    passed: firstPage === 0,
    detail: String(firstPage),
  });

  const passedCount = results.filter((entry) => entry.passed).length;
  results.push({
    name: "Search complete gate",
    passed: passedCount === results.length,
    detail: `${passedCount}/${results.length}`,
  });

  return results;
}