import "@midnight-ntwrk/dapp-connector-api";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

export const MIDNIGHT_NETWORKS = [
  { id: "mainnet", label: "Mainnet", enabled: true },
  { id: "preview", label: "Preview", enabled: true },
  { id: "preprod", label: "Preprod", enabled: true },
] as const;
export type MidnightNetworkId = (typeof MIDNIGHT_NETWORKS)[number]["id"];
export const DEFAULT_NETWORK: MidnightNetworkId = "mainnet";

export interface MidnightWalletConnection {
  walletId: string;
  walletName: string;
  address: string;
  networkId: string;
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

export async function connectMidnightWallet(): Promise<MidnightWalletConnection> {
  const wallets = listWallets();
  if (wallets.length === 0) {
    throw new Error("No Midnight wallet found in this browser");
  }

  const selectedWallet = getPreferredWallet(wallets);
  if (!selectedWallet) {
    throw new Error("No Midnight wallet found in this browser");
  }

  // Try each network until one connects — the wallet accepts whichever it's configured for
  const networkIds = MIDNIGHT_NETWORKS.filter(n => n.enabled).map(n => n.id);
  let connectedApi: ConnectedAPI | null = null;
  let lastError: unknown;

  for (const netId of networkIds) {
    try {
      connectedApi = await selectedWallet.wallet.connect(netId);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!connectedApi) {
    throw lastError ?? new Error("Could not connect to any network");
  }

  try {
    await connectedApi.hintUsage(["getShieldedAddresses", "getConnectionStatus", "getConfiguration"]);
  } catch {
    // Permission prompting is wallet-specific; connection can still succeed without this hint.
  }

  const connectionStatus = await connectedApi.getConnectionStatus();
  if (connectionStatus.status !== "connected") {
    throw new Error("Wallet connection is not active");
  }

  const detectedNetwork = connectionStatus.networkId;
  const { shieldedAddress } = await connectedApi.getShieldedAddresses();

  return {
    walletId: selectedWallet.walletId,
    walletName: selectedWallet.wallet.name,
    address: shieldedAddress,
    networkId: detectedNetwork,
    connectedApi,
  };
}

export function watchWalletSync(
  connectedApi: ConnectedAPI,
  onProgress: (pct: number) => void,
): Promise<void> {
  return connectedApi.getConfiguration().then((config) => {
    return new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          onProgress(100);
          try { ws.close(); } catch {}
          resolve();
        }
      };

      // Fallback: if indexer never responds, skip after 30s
      const timeout = setTimeout(finish, 30_000);

      const ws = new WebSocket(config.indexerWsUri, "graphql-transport-ws");
      const sessionId = crypto.randomUUID();

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "connection_init" }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "connection_ack") {
          ws.send(JSON.stringify({
            id: "sync",
            type: "subscribe",
            payload: {
              query: `subscription { shieldedTransactions(sessionId: "${sessionId}", sendProgressUpdates: true) { ... on ShieldedTransactionsProgress { highestIndex highestRelevantWalletIndex } } }`,
            },
          }));
        }

        if (msg.type === "next" && msg.id === "sync") {
          const data = msg.payload?.data?.shieldedTransactions;
          if (data && "highestIndex" in data) {
            const total = data.highestIndex as number;
            const wallet = data.highestRelevantWalletIndex as number;
            const pct = total > 0 ? Math.min(100, Math.round((wallet / total) * 100)) : 100;
            onProgress(pct);
            if (pct >= 100) {
              clearTimeout(timeout);
              finish();
            }
          }
        }

        // Subscription ended or errored — don't block the user
        if (msg.type === "error" || msg.type === "complete") {
          clearTimeout(timeout);
          finish();
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        finish();
      };
    });
  }).catch(() => {
    // getConfiguration() not supported or failed — skip sync
    onProgress(100);
  });
}

export function getMidnightWalletError(error: unknown, networkId?: string): string {
  if (!hasMidnightWallet()) {
    return "install a Midnight wallet to continue";
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
