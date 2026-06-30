import { actionCreators, setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

import type { NearUpgradeConfig } from "../types/game";

import "@near-wallet-selector/modal-ui/styles.css";

const RPC_NODES = ["https://free.rpc.fastnear.com", "https://rpc.mainnet.near.org"];

let selectorPromise: Promise<WalletSelector> | null = null;
let modalInstance: WalletSelectorModal | null = null;

export type NearUpgradeTier = "pro" | "vip";
export type NearUpgradeToken = "usdt" | "usdc";

export interface PayNearFtUpgradeParams {
  tier: NearUpgradeTier;
  token: NearUpgradeToken;
  config: NearUpgradeConfig;
  boundWallet?: string | null;
}

export interface PayNearFtUpgradeResult {
  success: boolean;
  shouldClaim: boolean;
  message: string;
  accountId?: string;
}

function validateBoundWallet(accountId: string, boundWallet?: string | null): void {
  if (boundWallet && accountId !== boundWallet) {
    throw new Error(
      `Connected wallet (${accountId}) does not match your hub-bound wallet (${boundWallet}). Connect the correct wallet on soulmd-hub.`,
    );
  }
}

export function getNearErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown NEAR wallet error";
    }
  }
  return "Unknown NEAR wallet error";
}

function transactionFailed(outcome: unknown): boolean {
  if (!outcome || typeof outcome !== "object") {
    return false;
  }
  const record = outcome as Record<string, unknown>;
  if (record.error) {
    return true;
  }
  if (record.status && typeof record.status === "object" && "Failure" in record.status) {
    return true;
  }
  const receipts = record.receipts_outcome;
  if (Array.isArray(receipts)) {
    return receipts.some((receipt) => {
      const status = (receipt as { outcome?: { status?: unknown } })?.outcome?.status;
      return Boolean(status && typeof status === "object" && "Failure" in status);
    });
  }
  return false;
}

function walletErrorAllowsClaim(error: unknown): boolean {
  const message = getNearErrorMessage(error).toLowerCase();
  return (
    message.includes("validation") ||
    message.includes("not found") ||
    message.includes("executed") ||
    message.includes("providererror") ||
    message.includes("request validation error")
  );
}

export async function initNearWallet(contractId = "soulmd-hub.near"): Promise<WalletSelector> {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: {
        networkId: "mainnet",
        nodeUrl: RPC_NODES[0],
        helperUrl: "https://helper.mainnet.near.org",
        explorerUrl: "https://nearblocks.io",
        indexerUrl: "https://mainnet-indexer-api.nearblocks.io/v1",
      },
      fallbackRpcUrls: RPC_NODES.slice(1),
      modules: [setupMyNearWallet()],
      debug: false,
    }).then((selector) => {
      modalInstance = setupModal(selector, {
        contractId,
        theme: "dark",
      });
      return selector;
    });
  }
  return selectorPromise;
}

export function getConnectedNearAccount(selector: WalletSelector): string | null {
  const state = selector.store.getState();
  return state.accounts.length > 0 ? state.accounts[0].accountId : null;
}

export async function connectNearWallet(boundWallet?: string | null): Promise<string> {
  const selector = await initNearWallet();

  if (selector.isSignedIn()) {
    const accountId = getConnectedNearAccount(selector);
    if (!accountId) {
      modalInstance?.show();
      throw new Error("Connect a NEAR wallet to continue.");
    }
    validateBoundWallet(accountId, boundWallet);
    return accountId;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      subscription.remove();
      reject(new Error("Wallet connection timed out. Open the wallet modal and try again."));
    }, 120_000);

    const subscription = selector.on("signedIn", ({ accounts }) => {
      window.clearTimeout(timeout);
      subscription.remove();
      const accountId = accounts[0]?.accountId;
      if (!accountId) {
        reject(new Error("No account returned from wallet."));
        return;
      }
      try {
        validateBoundWallet(accountId, boundWallet);
        resolve(accountId);
      } catch (error) {
        reject(error);
      }
    });

    modalInstance?.show();
  });
}

function tokenContractId(config: NearUpgradeConfig, token: NearUpgradeToken): string {
  return token === "usdt" ? config.usdt_contract_id : config.usdc_contract_id;
}

function upgradeAmountRaw(config: NearUpgradeConfig, tier: NearUpgradeTier): string {
  return tier === "vip" ? config.vip_amount_raw : config.pro_amount_raw;
}

export async function payNearFtUpgrade(params: PayNearFtUpgradeParams): Promise<PayNearFtUpgradeResult> {
  const { tier, token, config, boundWallet } = params;
  const accountId = await connectNearWallet(boundWallet);

  const tokenContract = tokenContractId(config, token);
  const hubContract = config.soul_contract_id;
  const amount = upgradeAmountRaw(config, tier);
  const msg = `upgrade:${tier}`;
  const displayAmount = tier === "vip" ? config.vip_amount_usd : config.pro_amount_usd;

  if (!tokenContract || tokenContract === hubContract) {
    throw new Error(
      `Payment misconfiguration: ${token.toUpperCase()} contract resolved to "${tokenContract || ""}".`,
    );
  }

  const selector = await initNearWallet(hubContract);
  const wallet = await selector.wallet();

  try {
    const outcome = await wallet.signAndSendTransaction({
      receiverId: tokenContract,
      actions: [
        actionCreators.functionCall(
          "ft_transfer_call",
          {
            receiver_id: hubContract,
            amount,
            msg,
          },
          BigInt("300000000000000"),
          BigInt("1"),
        ),
      ],
    });

    if (transactionFailed(outcome)) {
      return {
        success: false,
        shouldClaim: false,
        message: getNearErrorMessage(outcome),
        accountId,
      };
    }

    return {
      success: true,
      shouldClaim: true,
      message: `Paid $${displayAmount} ${token.toUpperCase()} on-chain. Claiming upgrade...`,
      accountId,
    };
  } catch (error) {
    if (walletErrorAllowsClaim(error)) {
      return {
        success: true,
        shouldClaim: true,
        message: "Transaction submitted (wallet could not confirm). Verifying on-chain credit...",
        accountId,
      };
    }
    return {
      success: false,
      shouldClaim: false,
      message: getNearErrorMessage(error),
      accountId,
    };
  }
}