import { runObservatoryAcceptanceTests } from "../src/acceptance/observatoryAcceptance";

const results = runObservatoryAcceptanceTests();
let failed = 0;

for (const result of results) {
  const mark = result.passed ? "✓" : "✗";
  const detail = result.detail ? ` (${result.detail})` : "";
  console.log(`  ${mark} ${result.name}${detail}`);
  if (!result.passed) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\nObservatory acceptance failed: ${results.length - failed}/${results.length} passed`);
  process.exit(1);
}

console.log(`\nObservatory acceptance passed (${results.length} tests).`);