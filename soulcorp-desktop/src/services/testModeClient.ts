import { invoke } from "@tauri-apps/api/core";

export interface TestModeResult {
  message: string;
  company_name?: string | null;
  company_id?: string | null;
}

export async function clearAllTestData(): Promise<TestModeResult> {
  return invoke<TestModeResult>("clear_all_test_data");
}

export async function seedFakeTestData(): Promise<TestModeResult> {
  return invoke<TestModeResult>("seed_fake_test_data");
}