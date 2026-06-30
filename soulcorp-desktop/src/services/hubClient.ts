const HUB_BASE_URL = import.meta.env.VITE_SOULMD_HUB_URL ?? "https://soulmd-hub.ysk.hk";

export class HubClient {
  constructor(private readonly baseUrl: string = HUB_BASE_URL) {}

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: `Hub client placeholder. Target: ${this.baseUrl} (Phase 5)`,
    };
  }
}

export const hubClient = new HubClient();