import { invoke } from "../utils/tauriInvoke";

export interface TestModeResult {
  message: string;
  company_name?: string | null;
  company_id?: string | null;
}

export async function clearAllTestData(): Promise<TestModeResult> {
  return invoke<TestModeResult>("clear_all_test_data");
}