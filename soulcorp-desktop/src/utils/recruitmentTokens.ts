import type { RecruitmentCandidate } from "../types/game";

/** Matches backend hire_candidate onboarding charge: monthly_salary * 0.5 tokens */
export function recruitOnboardingTokens(hourlyRateUsdt: number): number {
  const monthlySalary = hourlyRateUsdt * 160;
  return Math.round(monthlySalary * 0.5);
}

export function recruitOnboardingTokensForCandidate(candidate: RecruitmentCandidate): number {
  return recruitOnboardingTokens(candidate.hourly_rate_usdt);
}

