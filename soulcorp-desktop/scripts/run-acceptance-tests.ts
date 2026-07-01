import { runAcceptanceTests, summarizeResults } from "../src/acceptance/acceptanceTests";

const results = runAcceptanceTests();
const summary = summarizeResults(results);
const phase1Results = results.filter((result) => result.name.startsWith("Phase1 ") || result.name.startsWith("P1 "));
const phase1Summary = summarizeResults(phase1Results);
const phase1Gate = results.find((result) => result.name === "Phase 1 complete gate");
const phase2Results = results.filter((result) => result.name.startsWith("P2 "));
const phase2Summary = summarizeResults(phase2Results);
const phase2Gate = results.find((result) => result.name === "Phase 2 complete gate");

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

if (!summary.ok) {
  process.exit(1);
}