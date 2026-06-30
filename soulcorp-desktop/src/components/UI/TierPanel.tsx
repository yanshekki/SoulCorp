import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fetchSoulBalance } from "../../services/hubClient";
import { useGameStore } from "../../stores/gameStore";
import type { ClaimNearUpgradeResult, NearUpgradeConfig, TierBenefits } from "../../types/game";

interface UpgradeTierResult {
  tier: string;
  soul_balance: number;
  soul_staked: number;
  message: string;
  benefits: TierBenefits;
  via_hub: boolean;
}

export function TierPanel() {
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const settings = useGameStore((state) => state.settings);
  const setTierBenefits = useGameStore((state) => state.setTierBenefits);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [nearConfig, setNearConfig] = useState<NearUpgradeConfig | null>(null);

  useEffect(() => {
    invoke<TierBenefits>("get_tier_benefits")
      .then(setTierBenefits)
      .catch((error) => setStatusMessage(String(error)));

    if (!settings.pure_local_mode) {
      void fetchSoulBalance()
        .then(setHubStatus)
        .catch(() => undefined);
      invoke<NearUpgradeConfig>("get_near_upgrade_config")
        .then(setNearConfig)
        .catch(() => undefined);
    }
  }, [hubStatus.user_tier, setStatusMessage, setTierBenefits, settings.pure_local_mode, setHubStatus]);

  const upgradeTier = async (targetTier: "pro" | "vip") => {
    try {
      const result = await invoke<UpgradeTierResult>("upgrade_tier", {
        request: { target_tier: targetTier },
      });
      setTierBenefits(result.benefits);
      setHubStatus({
        ...hubStatus,
        user_tier: result.tier,
        soul_balance: result.soul_balance,
        soul_staked: result.soul_staked,
        connected: true,
      });
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const openHubUpgrade = async () => {
    try {
      const url = await invoke<string>("open_hub_upgrade_page");
      setStatusMessage(`Opened hub upgrade page: ${url}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const claimNearUpgrade = async (targetTier: "pro" | "vip", token: "usdt" | "usdc") => {
    try {
      const result = await invoke<ClaimNearUpgradeResult>("claim_near_tier_upgrade", {
        request: { tier: targetTier, token },
      });
      setTierBenefits(result.benefits);
      setHubStatus({
        ...hubStatus,
        user_tier: result.tier,
        connected: true,
      });
      setStatusMessage(result.message);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const upgradeHint =
    tierBenefits.tier === "vip"
      ? "You have full Executive Lounge access."
      : tierBenefits.tier === "pro"
        ? "Stake 500 $SOUL or pay on-chain to unlock VIP perks."
        : "Stake $SOUL on hub (Pro 100 / VIP 500) or pay USDT/USDC on NEAR.";

  return (
    <section className="panel-card tier-panel">
      <h2>Pro / VIP</h2>
      <div className="hub-status-row">
        <span className={`hub-pill tier tier-${tierBenefits.tier}`}>
          {tierBenefits.tier.toUpperCase()}
        </span>
        <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
        {hubStatus.soul_staked > 0 ? (
          <span className="hub-pill balance">{hubStatus.soul_staked.toFixed(0)} staked</span>
        ) : null}
      </div>

      {hubStatus.near_wallet_address ? (
        <p className="muted near-wallet-line">NEAR: {hubStatus.near_wallet_address}</p>
      ) : (
        <p className="muted">Bind a NEAR wallet on soulmd-hub to use on-chain tier upgrades.</p>
      )}

      <div className="tier-benefits-grid">
        <article>
          <span>Platform fee</span>
          <strong>{tierBenefits.platform_fee_percent.toFixed(0)}%</strong>
        </article>
        <article>
          <span>Agent cap</span>
          <strong>{tierBenefits.max_agents ?? "Unlimited"}</strong>
        </article>
        <article>
          <span>Cloud sync</span>
          <strong>{tierBenefits.cloud_sync_enabled ? "Yes" : "No"}</strong>
        </article>
        <article>
          <span>Priority gigs</span>
          <strong>{tierBenefits.priority_gig_matching ? "Yes" : "No"}</strong>
        </article>
        <article>
          <span>Event foresight</span>
          <strong>{tierBenefits.event_foresight_days} days</strong>
        </article>
        <article>
          <span>White-label export</span>
          <strong>{tierBenefits.white_label_export ? "Yes" : "No"}</strong>
        </article>
      </div>

      <p className="muted">{upgradeHint}</p>

      {!settings.pure_local_mode && tierBenefits.tier === "free" ? (
        <div className="panel-actions stacked">
          <button type="button" onClick={() => void upgradeTier("pro")}>
            Upgrade to Pro (stake 100 $SOUL)
          </button>
          <button type="button" onClick={() => void upgradeTier("vip")}>
            Upgrade to VIP (stake 500 $SOUL)
          </button>
        </div>
      ) : null}

      {!settings.pure_local_mode && tierBenefits.tier === "pro" ? (
        <div className="panel-actions">
          <button type="button" onClick={() => void upgradeTier("vip")}>
            Upgrade to VIP (stake 500 $SOUL)
          </button>
        </div>
      ) : null}

      {!settings.pure_local_mode && nearConfig ? (
        <div className="near-upgrade-block">
          <h3>NEAR On-Chain Upgrade</h3>
          <p className="muted">
            Pay {nearConfig.vip_amount_usd} USDT/USDC for VIP or {nearConfig.pro_amount_usd} for Pro
            via ft_transfer_call, then claim here.
          </p>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void openHubUpgrade()}>
              Open Hub Upgrade Page (wallet + payment)
            </button>
            <button type="button" onClick={() => void claimNearUpgrade("vip", "usdt")}>
              Claim VIP (USDT on-chain)
            </button>
            <button type="button" onClick={() => void claimNearUpgrade("pro", "usdt")}>
              Claim Pro (USDT on-chain)
            </button>
          </div>
        </div>
      ) : null}

      {tierBenefits.executive_lounge ? (
        <p className="tier-highlight">Executive Lounge: exclusive high-budget gigs unlocked.</p>
      ) : null}
    </section>
  );
}