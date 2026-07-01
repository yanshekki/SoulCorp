import { runAcceptanceTests, summarizeResults } from "../src/acceptance/acceptanceTests";

const results = runAcceptanceTests();
const summary = summarizeResults(results);

for (const result of results) {
  const mark = result.passed ? "✓" : "✗";
  const detail = result.detail ? ` (${result.detail})` : "";
  console.log(`  ${mark} ${result.name}${detail}`);
}

console.log(`\n  ${summary.passed}/${results.length} tests passed`);

if (!summary.ok) {
  process.exit(1);
}