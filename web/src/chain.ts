import {
  createPublicClient, createWalletClient, custom, defineChain, http, numberToHex,
  type Abi, type Address, type Chain, type EIP1193Provider, type Hex, type PublicClient, type WalletClient
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export type Network = { chainId: number; name: string; symbol: string; rpcUrl: string; blockchainId: string; messenger: Address; explorerUrl?: string };
export type Config = {
  mode: 'local' | 'fuji-icm';
  demoMode?: boolean;
  game: Network; vault: Network;
  sea: Address; coop: Address; shipyard: Address; raid: Address; escrow: Address; usdc: Address;
};
type Injected = EIP1193Provider & { on?: (event: string, cb: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Injected } }

export const rpcUrl = (n: Network) => new URL(n.rpcUrl, location.origin).toString();

const chains = new Map<number, Chain>();
export function chainOf(n: Network): Chain {
  let c = chains.get(n.chainId);
  if (!c) {
    c = defineChain({ id: n.chainId, name: n.name, nativeCurrency: { name: n.symbol, symbol: n.symbol, decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl(n)] } } });
    chains.set(n.chainId, c);
  }
  return c;
}

const publics = new Map<number, PublicClient>();
export function pub(n: Network): PublicClient {
  let p = publics.get(n.chainId);
  if (!p) {
    // JSON-RPC batching folds the many small reads per refresh into one HTTP request.
    // Check for receipts quickly: viem's default is every 4 s. The local chain (proxied, relative URL) mines
    // instantly; a real L1 makes a block every second or two.
    const pollingInterval = n.rpcUrl.startsWith('/') ? 250 : 1000;
    p = createPublicClient({ chain: chainOf(n), transport: http(rpcUrl(n), { batch: { wait: 16 } }), pollingInterval }) as PublicClient;
    publics.set(n.chainId, p);
  }
  return p;
}

export async function read<T>(n: Network, address: Address, abi: Abi, functionName: string, args: unknown[] = []): Promise<T> {
  return await pub(n).readContract({ address, abi, functionName, args }) as T;
}

// ------------------------------------------------------------------ signers

export interface Signer {
  kind: 'guest' | 'injected';
  address: Address;
  wallet(n: Network): Promise<WalletClient>;
  signDigest(digest: Hex): Promise<Hex>;
}

const GUEST_KEY = 'lantern-guest-key';

/** Local-only guest wallet: one throwaway key per browser tab, so two tabs are two captains. */
export async function guestSigner(config: Config): Promise<Signer> {
  if (config.mode !== 'local') throw new Error('Guest wallets exist only in the local demo.');
  let key: Hex | null = null;
  try { key = sessionStorage.getItem(GUEST_KEY) as Hex | null; } catch { /* storage blocked */ }
  if (!key) {
    key = generatePrivateKey();
    try { sessionStorage.setItem(GUEST_KEY, key); } catch { /* key lives only in memory */ }
  }
  const account = privateKeyToAccount(key);
  // Local Anvil only: top up gas on both chains so the guest can play immediately.
  for (const n of [config.game, config.vault]) {
    await pub(n).request({ method: 'anvil_setBalance' as never, params: [account.address, numberToHex(10n ** 20n)] as never });
  }
  return {
    kind: 'guest',
    address: account.address,
    async wallet(n) { return createWalletClient({ account, chain: chainOf(n), transport: http(rpcUrl(n)) }); },
    async signDigest(digest) { return account.signMessage({ message: { raw: digest } }); }
  };
}

async function switchNetwork(provider: Injected, n: Network) {
  const chainId = numberToHex(n.chainId);
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const e = error as { code?: number; data?: { originalError?: { code?: number } } };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: n.name,
      nativeCurrency: { name: n.symbol, symbol: n.symbol, decimals: 18 }, rpcUrls: [rpcUrl(n)],
      ...(n.explorerUrl ? { blockExplorerUrls: [n.explorerUrl] } : {}) }] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}

/** MetaMask, Core, or a mobile wallet's in-app browser. */
export async function injectedSigner(): Promise<Signer> {
  const provider = window.ethereum;
  if (!provider) throw new Error('No wallet found. Open this page in MetaMask or Core (mobile: use the wallet app\'s browser).');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  const address = accounts[0];
  if (!address) throw new Error('The wallet did not share an account.');
  return {
    kind: 'injected',
    address,
    async wallet(n) {
      await switchNetwork(provider, n);
      const selected = await provider.request({ method: 'eth_accounts' }) as Address[];
      if (selected[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('Wallet account changed. Reconnect first.');
      return createWalletClient({ account: address, chain: chainOf(n), transport: custom(provider) });
    },
    async signDigest(digest) {
      return await provider.request({ method: 'personal_sign', params: [digest, address] }) as Hex;
    }
  };
}

export async function transact(signer: Signer, n: Network, address: Address, abi: Abi, functionName: string, args: unknown[] = []) {
  const wallet = await signer.wallet(n);
  const { request } = await pub(n).simulateContract({ account: signer.address, address, abi, functionName, args });
  const hash = await wallet.writeContract({ ...request, account: wallet.account ?? signer.address, chain: chainOf(n) } as never);
  const receipt = await pub(n).waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
  return { hash, receipt };
}
