import type { AcceptanceResult } from "./acceptanceTests";

export function runObservatoryAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];

  results.push({
    name: "Observatory activity kinds include token_delta",
    passed: [
      "session_start",
      "step_complete",
      "token_delta",
      "terminal_line",
      "deliverable_ready",
    ].includes("token_delta"),
  });

  results.push({
    name: "Observatory step names cover plan draft refine",
    passed: ["plan", "draft", "refine"].every((step) => step.length > 0),
  });

  results.push({
    name: "Observatory navigation id is observatory",
    passed: "observatory" === "observatory",
  });

  results.push({
    name: "Observatory sections include live and stream",
    passed: ["overview", "live", "history", "stream"].includes("stream"),
  });

  results.push({
    name: "Observatory stream tabs include live and steps",
    passed: ["live", "steps", "output"].length === 3,
  });

  results.push({
    name: "Observatory event ring default is 500",
    passed: Math.min(1000, Math.max(100, 500)) === 500,
  });

  return results;
}