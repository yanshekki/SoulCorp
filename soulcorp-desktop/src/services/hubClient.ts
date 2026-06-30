import { invoke } from "@tauri-apps/api/core";
import type { GigContract, HubGig, HubStatus, HubSyncPull } from "../types/game";

export interface HubConfigUpdate {
  base_url?: string;
  api_key?: string;
}

export interface CreateHubGigRequest {
  title: string;
  description: string;
  budget_usdt: number;
  required_skills: string[];
}

export async function getHubStatus(): Promise<HubStatus> {
  return invoke<HubStatus>("get_hub_status");
}

export async function updateHubConfig(update: HubConfigUpdate): Promise<HubStatus> {
  return invoke<HubStatus>("update_hub_config", { update });
}

export async function listHubGigs(): Promise<HubGig[]> {
  return invoke<HubGig[]>("list_hub_gigs");
}

export async function createHubGig(request: CreateHubGigRequest): Promise<Record<string, unknown>> {
  return invoke<Record<string, unknown>>("create_hub_gig", { request });
}

export async function listGigContracts(): Promise<GigContract[]> {
  return invoke<GigContract[]>("list_gig_contracts");
}

export async function acceptHubGig(gigId: number): Promise<GigContract> {
  return invoke<GigContract>("accept_hub_gig", { request: { gig_id: gigId } });
}

export async function startGigWork(contractId: string): Promise<GigContract> {
  return invoke<GigContract>("start_gig_work", { request: { contract_id: contractId } });
}

export async function submitGigForQc(contractId: string): Promise<GigContract> {
  return invoke<GigContract>("submit_gig_for_qc", { request: { contract_id: contractId } });
}

export async function completeHubGig(contractId: string): Promise<GigContract> {
  return invoke<GigContract>("complete_hub_gig", { request: { contract_id: contractId } });
}

export async function rejectGigQc(
  contractId: string,
  qcNotes?: string,
): Promise<GigContract> {
  return invoke<GigContract>("reject_gig_qc", {
    request: { contract_id: contractId, qc_notes: qcNotes ?? null },
  });
}

export async function disputeHubGig(
  contractId: string,
  qcNotes?: string,
): Promise<GigContract> {
  return invoke<GigContract>("dispute_hub_gig", {
    request: { contract_id: contractId, qc_notes: qcNotes ?? null },
  });
}

export async function syncWithHub(): Promise<HubSyncPull> {
  return invoke<HubSyncPull>("sync_with_hub");
}

export async function fetchSoulBalance(): Promise<HubStatus> {
  return invoke<HubStatus>("fetch_soul_balance");
}

export async function signNearTransaction(payload: {
  receiver_id: string;
  amount: string;
  memo?: string;
}): Promise<string> {
  return invoke<string>("sign_near_transaction", { txPayload: payload });
}