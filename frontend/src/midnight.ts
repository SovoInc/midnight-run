import "@midnight-ntwrk/dapp-connector-api";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

export const MIDNIGHT_NETWORKS = [
  { id: "preview", label: "Preview", enabled: true },
  { id: "preprod", label: "Preprod", enabled: true },
  { id: "mainnet", label: "Mainnet", enabled: false },
] as const;
export type MidnightNetworkId = (typeof MIDNIGHT_NETWORKS)[number]["id"];
export const DEFAULT_NETWORK: MidnightNetworkId = "preview";

export interface MidnightWalletConnection {
  walletId: string;
  walletName: string;
  address: string;
  connectedApi: ConnectedAPI;
}

function listWallets(): Array<{ walletId: string; wallet: InitialAPI }> {
  return Object.entries(window.midnight ?? {}).map(([walletId, wallet]) => ({
    walletId,
    wallet,
  }));
}

function getPreferredWallet(wallets: Array<{ walletId: string; wallet: InitialAPI }>) {
  return wallets.find(({ walletId }) => walletId === "mnLace") ?? wallets[0];
}

export function hasMidnightWallet(): boolean {
  return listWallets().length > 0;
}

export async function connectMidnightWallet(networkId: MidnightNetworkId): Promise<MidnightWalletConnection> {
  const wallets = listWallets();
  if (wallets.length === 0) {
    throw new Error("No Midnight wallet found in this browser");
  }

  const selectedWallet = getPreferredWallet(wallets);
  if (!selectedWallet) {
    throw new Error("No Midnight wallet found in this browser");
  }

  const connectedApi = await selectedWallet.wallet.connect(networkId);

  try {
    await connectedApi.hintUsage(["getShieldedAddresses", "getConnectionStatus", "getConfiguration"]);
  } catch {
    // Permission prompting is wallet-specific; connection can still succeed without this hint.
  }

  const connectionStatus = await connectedApi.getConnectionStatus();
  if (connectionStatus.status !== "connected") {
    throw new Error("Wallet connection is not active");
  }
  if (connectionStatus.networkId !== networkId) {
    throw new Error(`Wallet connected to ${connectionStatus.networkId} instead of ${networkId}`);
  }

  const { shieldedAddress } = await connectedApi.getShieldedAddresses();

  return {
    walletId: selectedWallet.walletId,
    walletName: selectedWallet.wallet.name,
    address: shieldedAddress,
    connectedApi,
  };
}

export function getMidnightWalletError(error: unknown, networkId?: string): string {
  if (!hasMidnightWallet()) {
    return "install Midnight Lace to continue";
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("reject") || message.includes("denied") || message.includes("cancel")) {
    return "wallet connection was cancelled";
  }

  if (message.includes("network")) {
    return `connect your wallet to ${networkId ?? "the selected network"}`;
  }

  return "wallet connection failed";
}
