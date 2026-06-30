import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fetchSoulBalance } from "../../services/hubClient";
import {
  connectNearWallet,
  getConnectedNearAccount,
  initNearWallet,
  payNearFtUpgrade,
  type NearUpgradeToken,
  type NearUpgradeTier,
} from "../../services/nearWallet";
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
  const [nearWalletAccount, setNearWalletAccount] = useState<string | null>(null);
  const [nearPaying, setNearPaying] = useState(false);

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
      void initNearWallet()
        .then((selector) => setNearWalletAccount(getConnectedNearAccount(selector)))
        .catch(() => undefined);
    }
  }, [hubStatus.user_tier, setStatusMessage, setTierBenefits, settings.pure_local_mode, setHubStatus]);

  const connectWallet = async () => {
    try {
      const accountId = await connectNearWallet(hubStatus.near_wallet_address);
      setNearWalletAccount(accountId);
      setStatusMessage(`NEAR wallet connected: ${accountId}`);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

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

  const applyClaimResult = (result: ClaimNearUpgradeResult) => {
    setTierBenefits(result.benefits);
    setHubStatus({
      ...hubStatus,
      user_tier: result.tier,
      connected: true,
    });
    setStatusMessage(result.message);
  };

  const claimNearUpgrade = async (targetTier: NearUpgradeTier, token: NearUpgradeToken) => {
    try {
      const result = await invoke<ClaimNearUpgradeResult>("claim_near_tier_upgrade", {
        request: { tier: targetTier, token },
      });
      applyClaimResult(result);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const payNearInApp = async (targetTier: NearUpgradeTier, token: NearUpgradeToken) => {
    if (!nearConfig) {
      setStatusMessage("NEAR upgrade config not loaded yet.");
      return;
    }
    if (!hubStatus.near_wallet_address) {
      setStatusMessage("Bind a NEAR wallet on soulmd-hub before paying on-chain.");
      return;
    }

    setNearPaying(true);
    setStatusMessage(`Initializing NEAR wallet for ${token.toUpperCase()} payment...`);

    try {
      const payResult = await payNearFtUpgrade({
        tier: targetTier,
        token,
        config: nearConfig,
        boundWallet: hubStatus.near_wallet_address,
      });

      if (!payResult.success) {
        setStatusMessage(payResult.message);
        return;
      }

      setStatusMessage(payResult.message);
      if (payResult.shouldClaim) {
        const claimResult = await invoke<ClaimNearUpgradeResult>("claim_near_tier_upgrade", {
          request: { tier: targetTier, token },
        });
        applyClaimResult(claimResult);
      }
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setNearPaying(false);
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
        <article>
          <span>Custom departments</span>
          <strong>{tierBenefits.custom_departments ? "Yes" : "No"}</strong>
        </article>
        <article>
          <span>AI Co-CEO</span>
          <strong>{tierBenefits.ai_co_ceo ? "Yes" : "No"}</strong>
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
            Pay ${nearConfig.vip_amount_usd} USDT/USDC for VIP or ${nearConfig.pro_amount_usd} for Pro
            in-app via ft_transfer_call, or use the hub page in your browser.
          </p>
          {nearWalletAccount ? (
            <p className="muted near-wallet-line">Wallet connected: {nearWalletAccount}</p>
          ) : (
            <button type="button" className="near-connect-btn" onClick={() => void connectWallet()}>
              Connect NEAR Wallet
            </button>
          )}
          <div className="near-pay-grid">
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("vip", "usdt")}
            >
              Pay VIP (USDT)
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("vip", "usdc")}
            >
              Pay VIP (USDC)
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("pro", "usdt")}
            >
              Pay Pro (USDT)
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("pro", "usdc")}
            >
              Pay Pro (USDC)
            </button>
          </div>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void openHubUpgrade()}>
              Open Hub Upgrade Page (browser fallback)
            </button>
            <button type="button" disabled={nearPaying} onClick={() => void claimNearUpgrade("vip", "usdt")}>
              Claim VIP (already paid on-chain)
            </button>
            <button type="button" disabled={nearPaying} onClick={() => void claimNearUpgrade("pro", "usdt")}>
              Claim Pro (already paid on-chain)
            </button>
          </div>
        </div>
      ) : null}

      {tierBenefits.executive_lounge ? (
        <p className="tier-highlight">Executive Lounge: exclusive high-budget gigs unlocked.</p>
      ) : null}

      {tierBenefits.custom_departments || tierBenefits.ai_co_ceo ? (
        <p className="tier-highlight">
          Open the Executive panel to create custom departments and run the AI Co-CEO.
        </p>
      ) : null}
    </section>
  );
}