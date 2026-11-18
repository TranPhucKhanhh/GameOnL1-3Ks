import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { keccak256, toHex, parseAbiItem } from 'viem';
import { artifact, clients, run, start, waitRpc, write } from './lib.mjs';

export const gameID = keccak256(toHex('lantern-local-game'));
export const vaultID = keccak256(toHex('lantern-local-cchain'));
export const worldSeed = keccak256(toHex('lantern-sea-demo-world-v1'));
const event = parseAbiItem('event MessageQueued(bytes32 indexed messageId, bytes32 indexed destinationBlockchainID, address destinationAddress, address sender, bytes message)');

async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} occupied. Stop the previous local session first.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

export async function startLocal({ gameChainId = 31337, vaultChainId = 31338, persistConfig = true } = {}) {
  run('forge', ['build']);
  execFileSync(process.execPath, ['scripts/sync-abi.mjs'], { stdio: 'inherit' });
  await Promise.all([assertFree(8545), assertFree(9545)]);
  const children = [];
  let stopped = false;
  const stop = () => { stopped = true; for (const child of children) child.kill(); };
  process.once('exit', stop);
  try {
    children.push(start('anvil', ['--host', '127.0.0.1', '--port', '8545', '--chain-id', String(gameChainId), '--silent'], { stdio: 'ignore' }));
    children.push(start('anvil', ['--host', '127.0.0.1', '--port', '9545', '--chain-id', String(vaultChainId), '--silent'], { stdio: 'ignore' }));
    for (const child of children) child.on('error', error => { console.error(error); stop(); });
    await Promise.all([waitRpc('http://127.0.0.1:8545'), waitRpc('http://127.0.0.1:9545')]);
    const config = {
      mode: 'local',
      demoMode: true,
      game: { chainId: gameChainId, name: 'Lantern Sea L1 (Anvil)', symbol: 'TIDE', rpcUrl: 'http://127.0.0.1:8545', blockchainId: gameID },
      vault: { chainId: vaultChainId, name: 'C-Chain stand-in (Anvil)', symbol: 'AVAX', rpcUrl: 'http://127.0.0.1:9545', blockchainId: vaultID }
    };
    const game = clients(config.game);
    const accounts = await game.public.request({ method: 'eth_accounts' });
    const deployer = accounts[0];
    const gc = clients(config.game, deployer);
    const vc = clients(config.vault, deployer);
    async function deploy(c, name, args) {
      const a = artifact(name);
      const hash = await c.wallet.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args });
      const receipt = await c.public.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${name} deployment failed`);
      return receipt.contractAddress;
    }
    config.game.messenger = await deploy(gc, 'MockTeleporter', [gameID]);
    config.vault.messenger = await deploy(vc, 'MockTeleporter', [vaultID]);
    config.usdc = await deploy(vc, 'MockUSDC', []);
    config.sea = await deploy(gc, 'LanternSea', [worldSeed, 256, true, deployer]);
    config.shipyard = await deploy(gc, 'Shipyard', [config.sea]);
    config.coop = await deploy(gc, 'CoopSail', [config.sea, 60, 14]);
    config.raid = await deploy(gc, 'BossRaid', [config.sea, config.shipyard, config.game.messenger, vaultID, deployer]);
    config.escrow = await deploy(vc, 'RaidEscrow', [config.usdc, config.vault.messenger, gameID, deployer, 100_000000n, 600]);
    await write(gc, config.sea, artifact('LanternSea').abi, 'setModules', [config.coop, config.shipyard, config.raid]);
    await write(gc, config.raid, artifact('BossRaid').abi, 'setPeer', [config.escrow]);
    await write(vc, config.escrow, artifact('RaidEscrow').abi, 'setPeer', [config.raid]);
    if (persistConfig) {
      await mkdir('.local', { recursive: true });
      await mkdir('web/public', { recursive: true });
      await writeFile('.local/config.json', JSON.stringify(config, null, 2) + '\n');
      // The browser reaches both Anvil nodes through Vite's same-origin proxy (web/vite.config.ts),
      // so a phone opening the dev server through a tunnel or LAN address needs only one port.
      const browserConfig = structuredClone(config);
      browserConfig.game.rpcUrl = '/rpc/game';
      browserConfig.vault.rpcUrl = '/rpc/cchain';
      await writeFile('web/public/config.json', JSON.stringify(browserConfig, null, 2) + '\n');
    }
    const routes = [
      { source: gc, destination: vc, sourceID: gameID, destinationID: vaultID, messenger: config.game.messenger,
        destinationMessenger: config.vault.messenger, sender: config.raid, receiver: config.escrow, cursor: 0n, queue: [] },
      { source: vc, destination: gc, sourceID: vaultID, destinationID: gameID, messenger: config.vault.messenger,
        destinationMessenger: config.game.messenger, sender: config.escrow, receiver: config.raid, cursor: 0n, queue: [] }
    ];
    const abi = artifact('MockTeleporter').abi;
    let busy = false;
    async function relay() {
      if (busy || stopped) return;
      busy = true;
      try {
        for (const route of routes) {
          const end = await route.source.public.getBlockNumber({ cacheTime: 0 });
          if (end >= route.cursor) {
            const logs = await route.source.public.getLogs({ address: route.messenger, event,
              fromBlock: route.cursor, toBlock: end, strict: true });
            route.queue.push(...logs.filter(l => l.args.destinationBlockchainID === route.destinationID
              && l.args.sender.toLowerCase() === route.sender.toLowerCase()
              && l.args.destinationAddress.toLowerCase() === route.receiver.toLowerCase()));
            route.cursor = end + 1n;
          }
          for (let i = 0; i < route.queue.length;) {
            const { args } = route.queue[i];
            try {
              const delivered = await route.destination.public.readContract({ address: route.destinationMessenger,
                abi, functionName: 'delivered', args: [args.messageId] });
              if (!delivered) await write(route.destination, route.destinationMessenger, abi, 'deliver',
                [args.messageId, route.sourceID, args.sender, args.destinationAddress, args.message]);
              route.queue.splice(i, 1);
            } catch (error) {
              console.error(`Local relay will retry ${args.messageId}: ${error.shortMessage ?? error.message}`);
              i++;
            }
          }
        }
      } finally { busy = false; }
    }
    return { config, accounts, gc, vc, relay, stop, children };
  } catch (error) { stop(); throw error; }
}
