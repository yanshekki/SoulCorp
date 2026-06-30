import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useGameStore } from "../../stores/gameStore";
import type { TierBenefits } from "../../types/game";

export function TierPanel() {
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const setTierBenefits = useGameStore((state) => state.setTierBenefits);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    invoke<TierBenefits>("get_tier_benefits")
      .then(setTierBenefits)
      .catch((error) => setStatusMessage(String(error)));
  }, [hubStatus.user_tier, setStatusMessage, setTierBenefits]);

  const upgradeHint =
    tierBenefits.tier === "vip"
      ? "You have full Executive Lounge access."
      : tierBenefits.tier === "pro"
        ? "Stake more $SOUL to unlock VIP perks."
        : "Stake $SOUL on soulmd-hub or subscribe to unlock Pro/VIP.";

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
      {tierBenefits.executive_lounge ? (
        <p className="tier-highlight">Executive Lounge: exclusive high-budget gigs unlocked.</p>
      ) : null}
    </section>
  );
}