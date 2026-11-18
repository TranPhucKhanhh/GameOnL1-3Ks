# Deploy to Fuji + your own Game L1 (real ICM)

[← README](../README.md)

**Never deploy `MockTeleporter` or `MockUSDC` publicly.** The mock messenger lets anyone forge messages. A public deployment uses the official Teleporter and a real ICM relayer.

Plan for this: the Builder Console's **free managed testnet nodes and hosted relayer shut down after about 3 days**. Write down every value below, and redo steps 1–6 before you record the video and again before demo day. Everything after step 1 takes a few minutes once you have done it once.

## 1. Create the Game L1 (Builder Console)

1. Sign in at [build.avax.network](https://build.avax.network/console) with a Builder account. It includes a testnet faucet, managed testnet nodes and a hosted ICM relayer.
2. **Create Chain** (Subnet-EVM on Fuji):
   - EVM chain ID: e.g. **202611**. Avoid 1, 43113 and 43114.
   - Native token: **TIDE**.
   - Pre-fund your deployer address in the genesis allocation, so you can hand out TIDE gas to players.
   - Keep Warp/ICM enabled.
3. **Managed Testnet Nodes**, then **Convert to L1**. The conversion cannot be undone, so check the settings first. Note the **RPC URL** (it must be HTTPS) and the explorer, if one is offered.
4. **ICM Setup:** deploy the Teleporter messenger on your L1. Fuji C-Chain already has it at `0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf`. Make sure both sides run the same Teleporter version.
5. **ICM Relayer:** create a hosted relayer for **Fuji C-Chain ↔ your L1**, and fund its address with gas on both chains. The contracts send messages with **zero relayer fee** and a gas limit of 700,000. The relayer must accept zero-fee messages in **both directions**.

## 2. Configure

```bat
copy .env.example .env
```

```bat
notepad .env
```

Fill in `GAME_RPC_URL`, `GAME_CHAIN_ID`, both messenger addresses, `USDC_ADDRESS` (Circle's Fuji test USDC; check the address in Circle's docs) and `DEPLOYER`. **Never put a private key in `.env`.** Then load the file and read both **blockchain IDs** (bytes32, not chain IDs):

```bat
call scripts\env.cmd
```

```bat
npm run cast -- call 0x0200000000000000000000000000000000000005 "getBlockchainID()(bytes32)" --rpc-url "%GAME_RPC_URL%"
```

```bat
npm run cast -- call 0x0200000000000000000000000000000000000005 "getBlockchainID()(bytes32)" --rpc-url "%FUJI_RPC_URL%"
```

Put the results in `GAME_BLOCKCHAIN_ID` and `ESCROW_BLOCKCHAIN_ID`, then run `call scripts\env.cmd` again.

All commands in this guide are for **Command Prompt (CMD)**, not PowerShell. Run `call scripts\env.cmd` in each new CMD window, and again after every edit to `.env`.

Import your **test** deployer key into Foundry's encrypted keystore. Foundry prompts for the key, so it never appears in a command or file:

```bat
npm run cast -- wallet import lantern-deployer --interactive
```

Get test AVAX for the deployer from the Builder faucet or team1vn.xyz/faucet.html.

## 3. Deploy and bind

```bat
npm run forge -- script script/Deploy.s.sol:DeployEscrow --rpc-url "%FUJI_RPC_URL%" --account lantern-deployer --sender "%DEPLOYER%" --broadcast
```

```bat
npm run forge -- script script/Deploy.s.sol:DeployGame --rpc-url "%GAME_RPC_URL%" --account lantern-deployer --sender "%DEPLOYER%" --broadcast
```

Copy the deployed addresses into `.env` (`ESCROW_ADDRESS`, `SEA_ADDRESS`, `COOP_ADDRESS`, `SHIPYARD_ADDRESS`, `RAID_ADDRESS`). The receipts are also in `broadcast/`. Reload the file, then bind each peer **once**:

```bat
call scripts\env.cmd
```

```bat
npm run forge -- script script/Deploy.s.sol:BindGamePeer --rpc-url "%GAME_RPC_URL%" --account lantern-deployer --sender "%DEPLOYER%" --broadcast
```

```bat
npm run forge -- script script/Deploy.s.sol:BindEscrowPeer --rpc-url "%FUJI_RPC_URL%" --account lantern-deployer --sender "%DEPLOYER%" --broadcast
```

Peers cannot be changed afterwards. If you bind the wrong address, deploy again.

## 4. Verify and build the frontend

```bat
npm run config:testnet
```

```bat
npm run build
```

`config:testnet` checks chain IDs, Warp blockchain IDs, bytecode, module wiring, peers, messengers and the token, then writes `web/public/config.json`. That file is public, so its RPC URLs must contain no secrets. `web/dist/` is a static site.

## 5. Host it over HTTPS

Upload `web/dist/` to Cloudflare Pages (or Vercel or Netlify) as a static site. Phones need HTTPS for the camera, and judges need one link that works. Re-upload after each redeploy, because `config.json` changes.

## 6. Prepare players

- **Gas on the L1:** send each test player a little TIDE from the genesis-funded deployer:

  ```bat
  npm run cast -- send <player> --value 1ether --rpc-url "%GAME_RPC_URL%" --account lantern-deployer
  ```

- **AVAX on Fuji:** each player needs some for the escrow transactions, from a faucet.
- **Test USDC:** lead captains get it from faucet.circle.com (Fuji).
- **Wallet:** on a phone, open the site inside MetaMask's or Core's built-in browser. The app adds both networks when needed.

## 7. Prove ICM before the demo

Run one real raid round trip and save the transaction links for the submission:
1. `acceptLead` on L1, then `RaidRegistered` on the Fuji escrow.
2. `fund` on Fuji, then `BountyUpdated` on L1.
3. `settle` on L1, then `RaidClosed` on Fuji, and finally `claim` on Fuji.

Never call `evm_increaseTime` or similar time-travel RPC methods on a public network. Demo mode already shortens the timers.
