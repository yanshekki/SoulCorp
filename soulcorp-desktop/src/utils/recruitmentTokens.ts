import type { RecruitmentCandidate } from "../types/game";

/** Monthly salary band (token units) — matches backend normalize_offered_salary. */
export const RECRUIT_SALARY_MIN = 500;
export const RECRUIT_SALARY_MAX = 50_000;
export const RECRUIT_SALARY_DEFAULT = 4_000;

/** Hub "hourly" can actually be a list price; normalize to monthly token salary. */
export function monthlySalaryFromHourly(hourlyRateUsdt: number): number {
  const rate = Number.isFinite(hourlyRateUsdt) ? hourlyRateUsdt : 0;
  if (rate <= 0) {
    return RECRUIT_SALARY_DEFAULT;
  }
  // Already looks like a monthly / list price, not hourly USDT.
  if (rate > 500) {
    return Math.min(Math.round(rate), RECRUIT_SALARY_MAX);
  }
  const monthly = Math.round(rate * 160);
  return Math.min(Math.max(monthly, RECRUIT_SALARY_MIN), RECRUIT_SALARY_MAX);
}

/** Matches backend hire_candidate onboarding charge: monthly_salary * 0.5 tokens */
export function recruitOnboardingTokens(hourlyRateUsdt: number): number {
  return Math.round(monthlySalaryFromHourly(hourlyRateUsdt) * 0.5);
}

export function recruitOnboardingTokensForCandidate(candidate: RecruitmentCandidate): number {
  return recruitOnboardingTokens(candidate.hourly_rate_usdt);
}

export function clampRecruitSalary(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return RECRUIT_SALARY_DEFAULT;
  }
  return Math.min(Math.max(Math.round(value), RECRUIT_SALARY_MIN), RECRUIT_SALARY_MAX);
}

