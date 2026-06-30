import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { TierBenefits } from "../../types/game";

interface UpgradeTierResult {
  tier: string;
  soul_balance: number;
  soul_staked: number;
  message: string;
  benefits: TierBenefits;
}

export function TierPanel() {
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const settings = useGameStore((state) => state.settings);
  const setTierBenefits = useGameStore((state) => state.setTierBenefits);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    invoke<TierBenefits>("get_tier_benefits")
      .then(setTierBenefits)
      .catch((error) => setStatusMessage(String(error)));
  }, [hubStatus.user_tier, setStatusMessage, setTierBenefits]);

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
        ? "Stake 500 $SOUL to unlock VIP perks."
        : "Stake $SOUL to unlock Pro (100) or VIP (500).";

  return (
    <section className="panel-card tier-panel">
      <h2>Pro / VIP</h2>
      <div className="hub-status-row">
        <span className={`hub-pill tier tier-${tierBenefits.tier}`}>
          {tierBenefits.tier.toUpperCase()}
        </span>
        <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
      </div>

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

      {tierBenefits.executive_lounge ? (
        <p className="tier-highlight">Executive Lounge: exclusive high-budget gigs unlocked.</p>
      ) : null}
    </section>
  );
}