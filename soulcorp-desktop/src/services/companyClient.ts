import { invoke } from "../utils/tauriInvoke";
import type {
  CompanyListResponse,
  CreateCompanyRequest,
  SwitchCompanyResponse,
} from "../types/game";

export async function listCompanies(): Promise<CompanyListResponse> {
  return invoke<CompanyListResponse>("list_companies");
}

export async function createCompany(
  request: CreateCompanyRequest,
): Promise<SwitchCompanyResponse> {
  return invoke<SwitchCompanyResponse>("create_company", { request });
}

export async function switchCompany(companyId: string): Promise<SwitchCompanyResponse> {
  return invoke<SwitchCompanyResponse>("switch_company", { companyId });
}

export async function deleteCompany(companyId: string): Promise<CompanyListResponse> {
  return invoke<CompanyListResponse>("delete_company", { companyId });
}