import { invoke } from "../utils/tauriInvoke";
import type { CompleteOnboardingRequest, OnboardingState } from "../types/game";

export async function getOnboardingState(): Promise<OnboardingState> {
  return invoke<OnboardingState>("get_onboarding_state");
}

export async function completeOnboarding(
  request: CompleteOnboardingRequest,
): Promise<OnboardingState> {
  return invoke<OnboardingState>("complete_onboarding", { request });
}