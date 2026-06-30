import { invoke } from "@tauri-apps/api/core";
import type { HubGig, HubStatus, HubSyncPull } from "../types/game";

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