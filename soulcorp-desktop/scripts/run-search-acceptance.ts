import { runSearchAcceptanceTests } from "../src/acceptance/searchAcceptance";

const results = runSearchAcceptanceTests();
let failed = 0;

for (const result of results) {
  const mark = result.passed ? "✓" : "✗";
  const detail = result.detail ? ` (${result.detail})` : "";
  console.log(`  ${mark} ${result.name}${detail}`);
  if (!result.passed) {
    failed += 1;
  }
}

const gate = results.find((result) => result.name === "Search complete gate");
if (!gate?.passed || failed > 0) {
  console.error(`\nSearch acceptance failed: ${results.length - failed}/${results.length} passed`);
  process.exit(1);
}

console.log(`\nSearch acceptance passed (${results.length} tests).`);