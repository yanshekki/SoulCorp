import { invoke } from "../../utils/tauriInvoke";
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
import { useI18n } from "../../i18n/I18nProvider";
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
  const { t } = useI18n();
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
      setStatusMessage(t("tier.walletConnectedStatus", { account: accountId }));
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
      setStatusMessage(t("tier.configNotLoaded"));
      return;
    }
    if (!hubStatus.near_wallet_address) {
      setStatusMessage(t("tier.bindWalletPay"));
      return;
    }

    setNearPaying(true);
    setStatusMessage(t("tier.initNear", { token: token.toUpperCase() }));

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

  return (
    <section className="panel-card tier-panel">
      <h2>{t("tier.title")}</h2>
      <div className="hub-status-row">
        <span className={`hub-pill tier tier-${tierBenefits.tier}`}>
          {tierBenefits.tier.toUpperCase()}
        </span>
        <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
        {hubStatus.soul_staked > 0 ? (
          <span className="hub-pill balance">{t("tier.staked", { n: hubStatus.soul_staked.toFixed(0) })}</span>
        ) : null}
      </div>

      {hubStatus.near_wallet_address ? (
        <p className="muted near-wallet-line">{t("tier.nearLine", { address: hubStatus.near_wallet_address })}</p>
      ) : (
        <p className="muted">{t("tier.bindWallet")}</p>
      )}

      <div className="tier-benefits-grid">
        <article>
          <span>{t("tier.platformFee")}</span>
          <strong>{tierBenefits.platform_fee_percent.toFixed(0)}%</strong>
        </article>
        <article>
          <span>{t("tier.agentCap")}</span>
          <strong>{tierBenefits.max_agents ?? t("tier.unlimited")}</strong>
        </article>
        <article>
          <span>{t("tier.cloudSync")}</span>
          <strong>{tierBenefits.cloud_sync_enabled ? t("tier.yes") : t("tier.no")}</strong>
        </article>
        <article>
          <span>{t("tier.priorityGigs")}</span>
          <strong>{tierBenefits.priority_gig_matching ? t("tier.yes") : t("tier.no")}</strong>
        </article>
        <article>
          <span>{t("tier.eventForesight")}</span>
          <strong>{t("tier.eventForesightDays", { n: tierBenefits.event_foresight_days })}</strong>
        </article>
        <article>
          <span>{t("tier.whiteLabel")}</span>
          <strong>{tierBenefits.white_label_export ? t("tier.yes") : t("tier.no")}</strong>
        </article>
        <article>
          <span>{t("tier.customDepts")}</span>
          <strong>{tierBenefits.custom_departments ? t("tier.yes") : t("tier.no")}</strong>
        </article>
        <article>
          <span>{t("tier.aiCoCeo")}</span>
          <strong>{tierBenefits.ai_co_ceo ? t("tier.yes") : t("tier.no")}</strong>
        </article>
      </div>

      <p className="muted">{t("tier.upgradeHint")}</p>

      {!settings.pure_local_mode && tierBenefits.tier === "free" ? (
        <div className="panel-actions stacked">
          <button type="button" onClick={() => void upgradeTier("pro")}>
            {t("tier.upgradePro")}
          </button>
          <button type="button" onClick={() => void upgradeTier("vip")}>
            {t("tier.upgradeVip")}
          </button>
        </div>
      ) : null}

      {!settings.pure_local_mode && tierBenefits.tier === "pro" ? (
        <div className="panel-actions">
          <button type="button" onClick={() => void upgradeTier("vip")}>
            {t("tier.upgradeVip")}
          </button>
        </div>
      ) : null}

      {!settings.pure_local_mode && nearConfig ? (
        <div className="near-upgrade-block">
          <h3>{t("tier.nearTitle")}</h3>
          <p className="muted">
            {t("tier.nearDesc", {
              vip: nearConfig.vip_amount_usd,
              pro: nearConfig.pro_amount_usd,
            })}
          </p>
          {nearWalletAccount ? (
            <p className="muted near-wallet-line">{t("tier.walletConnected", { account: nearWalletAccount })}</p>
          ) : (
            <button type="button" className="near-connect-btn" onClick={() => void connectWallet()}>
              {t("tier.connectNear")}
            </button>
          )}
          <div className="near-pay-grid">
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("vip", "usdt")}
            >
              {t("tier.payVipUsdt")}
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("vip", "usdc")}
            >
              {t("tier.payVipUsdc")}
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("pro", "usdt")}
            >
              {t("tier.payProUsdt")}
            </button>
            <button
              type="button"
              disabled={nearPaying}
              onClick={() => void payNearInApp("pro", "usdc")}
            >
              {t("tier.payProUsdc")}
            </button>
          </div>
          <div className="panel-actions stacked">
            <button type="button" onClick={() => void openHubUpgrade()}>
              {t("tier.openHubUpgrade")}
            </button>
            <button type="button" disabled={nearPaying} onClick={() => void claimNearUpgrade("vip", "usdt")}>
              {t("tier.claimVip")}
            </button>
            <button type="button" disabled={nearPaying} onClick={() => void claimNearUpgrade("pro", "usdt")}>
              {t("tier.claimPro")}
            </button>
          </div>
        </div>
      ) : null}

      <p className="tier-highlight">
        AI Co-CEO lives in Projects → Command Center. Executive Lounge gigs are in Marketplace.
      </p>
    </section>
  );
}