# Local development

[← README](../README.md)

```powershell
npm run local
```

This one command:
1. Builds the contracts and syncs the ABIs.
2. Starts two Anvil chains, one standing in for the **Game L1** (port 8545, chain 31337) and one for **C-Chain** (port 9545, chain 31338).
3. Deploys every contract with `DEMO_MODE=true`, binds the peers, and runs a **mock ICM relayer** every 0.5 s.
4. Starts Vite on http://127.0.0.1:5173.

The browser reaches both chains through Vite's proxy at `/rpc/game` and `/rpc/cchain` (see `web/vite.config.ts`), so the page needs only one port.

| File | Contents |
| --- | --- |
| `.local/config.json` | Addresses and absolute RPC URLs (for scripts) |
| `web/public/config.json` | Same addresses with proxy RPC paths (for the browser) |

Both are generated and git-ignored.

## Wallets

- **Local guest captain (recommended locally):** a throwaway key kept in the tab's `sessionStorage`, topped up with gas on both Anvil chains. A new tab gives a new captain, so you can play Parley, crew voyages and raids alone with two tabs side by side. Guest wallets are disabled on testnet deployments.
- **MetaMask / Core:** works too. The app adds and switches networks when it needs to. Local chains reset on every start, so clear the account's activity data in the wallet if it reports a nonce error.

## A full co-op session with two tabs

1. **Tab A and tab B:** each claims its home island.
2. **Parley:**
   - Tab A: **Crew → Show my code**, then expand **Copy as text** and copy the code.
   - Tab B: **Crew → No camera? Paste a code**, paste it, and confirm. Both maps are now shared for 10 minutes.
3. **Crew voyage:**
   - Find an island with a purple **⚓4/⚓5 crew** lane. Your home may not have one, so sail first if needed.
   - Tab A: **Plan crew voyage**, paste tab B's address (Crew tab → "Your address"), and send.
   - Tab B: **Crew → Join**. Both tabs open the sliding puzzle. Solve both within 60 seconds.
4. **Raid:**
   - Tab A: **Raid → Propose to lead** with tab B's address.
   - Tab B: **Accept**.
   - Tab A: **Get 100 test USDC**, then **Escrow on C-Chain**. Watch the bounty arrive on L1 through the relay.
   - A third tab can join as a helper and attack.
5. **Settle:** after the boss dies or the 10-minute epoch ends, press **Settle**, then **Claim** the USDC.

## Play on a phone

The phone has to reach your PC's dev server. The camera (QR scanning) also needs **HTTPS** unless the page is on `localhost`.

**Option 1: HTTPS tunnel (camera works).** Install Cloudflare's `cloudflared` from Cloudflare's official download page, then run these in a second terminal:

```powershell
npm run local
```

```powershell
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://….trycloudflare.com` address on the phone. Every RPC call goes through the same tunnel, through the Vite proxy. Anyone with the link can reach your dev server while the tunnel runs, so stop it when you finish.

**Option 2: same Wi-Fi, no tunnel (no camera).**

```powershell
npm run local:lan
```

Open `http://<your PC's LAN IP>:5173` on the phone, and use **paste a code** instead of the camera for Parley. Windows may ask to allow Node.js through the firewall.

Two phones, or a phone plus a PC tab, can then Parley by scanning each other's codes.

## Reset

Press `Ctrl+C` and run `npm run local` again. Each run starts fresh chains, fresh contracts and a fresh sea, and old guest keys get new balances.
