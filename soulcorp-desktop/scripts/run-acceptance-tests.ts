import { runAcceptanceTests, summarizeResults } from "../src/acceptance/acceptanceTests";

const results = runAcceptanceTests();
const summary = summarizeResults(results);
const phase1Results = results.filter((result) => result.name.startsWith("Phase1 ") || result.name.startsWith("P1 "));
const phase1Summary = summarizeResults(phase1Results);
const phase1Gate = results.find((result) => result.name === "Phase 1 complete gate");
const phase2Results = results.filter((result) => result.name.startsWith("P2 "));
const phase2Summary = summarizeResults(phase2Results);
const phase2Gate = results.find((result) => result.name === "Phase 2 complete gate");
const phase3Results = results.filter((result) => result.name.startsWith("P3 "));
const phase3Summary = summarizeResults(phase3Results);
const phase3Gate = results.find((result) => result.name === "Phase 3 complete gate");
const phase4Results = results.filter((result) => result.name.startsWith("P4 "));
const phase4Summary = summarizeResults(phase4Results);
const phase4Gate = results.find((result) => result.name === "Phase 4 complete gate");
const phase5ArtResults = results.filter((result) => result.name.startsWith("P5 "));
const phase5ArtSummary = summarizeResults(phase5ArtResults);
const phase5ArtGate = results.find((result) => result.name === "Art deepening complete gate");

for (const result of results) {
  const mark = result.passed ? "✓" : "✗";
  const detail = result.detail ? ` (${result.detail})` : "";
  console.log(`  ${mark} ${result.name}${detail}`);
}

console.log(`\n  ${summary.passed}/${results.length} tests passed`);
console.log(
  `  Phase 1: ${phase1Summary.passed}/${phase1Results.length} checks — ${phase1Gate?.passed ? "COMPLETE" : "INCOMPLETE"}`,
);
console.log(
  `  Phase 2: ${phase2Summary.passed}/${phase2Results.length} checks — ${phase2Gate?.passed ? "COMPLETE" : "INCOMPLETE"}`,
);
console.log(
  `  Phase 3: ${phase3Summary.passed}/${phase3Results.length} checks — ${phase3Gate?.passed ? "COMPLETE" : "INCOMPLETE"}`,
);
console.log(
  `  Phase 4: ${phase4Summary.passed}/${phase4Results.length} checks — ${phase4Gate?.passed ? "COMPLETE" : "INCOMPLETE"}`,
);
console.log(
  `  Art: ${phase5ArtSummary.passed}/${phase5ArtResults.length} checks — ${phase5ArtGate?.passed ? "COMPLETE" : "INCOMPLETE"}`,
);

if (!summary.ok) {
  process.exit(1);
}