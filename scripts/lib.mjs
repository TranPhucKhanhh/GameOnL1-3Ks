import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';

export function tool(name) {
  const bin = `${name}${process.platform === 'win32' ? '.exe' : ''}`;
  const local = resolve('.tools/foundry', bin);
  if (existsSync(local)) return local;
  const homeBin = join(homedir(), '.foundry', 'bin', bin);
  return existsSync(homeBin) ? homeBin : name;
}
export function run(name, args, options = {}) {
  const result = spawnSync(tool(name), args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} failed (${result.status})`);
}
export function start(name, args, options = {}) {
  return spawn(tool(name), args, { stdio: 'inherit', windowsHide: true, ...options });
}
export function artifact(name) {
  return JSON.parse(readFileSync(resolve(`out/${name}.sol/${name}.json`), 'utf8'));
}
export function clients(config, account) {
  const chain = defineChain({ id: config.chainId, name: config.name,
    nativeCurrency: { name: config.symbol, symbol: config.symbol, decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } } });
  return { chain, public: createPublicClient({ chain, transport: http() }),
    wallet: createWalletClient({ chain, account, transport: http() }) };
}
export async function waitRpc(url, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
      if ((await r.json()).result) return;
    } catch { /* process still booting */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`RPC did not start: ${url}`);
}
export async function write(c, address, abi, functionName, args = []) {
  const { request } = await c.public.simulateContract({ account: c.wallet.account, address, abi, functionName, args });
  const hash = await c.wallet.writeContract(request);
  const receipt = await c.public.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${hash}`);
  return receipt;
}
