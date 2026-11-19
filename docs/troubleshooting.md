# Troubleshooting

[← README](../README.md)

| Symptom | Fix |
| --- | --- |
| `Port 8545 occupied` | A previous `npm run local` or test is still running. Stop it with `Ctrl+C`, or end the leftover `anvil` and `node` processes. |
| "No config yet" page | Run `npm run local` (local), or `npm run config:testnet` and rebuild (testnet). |
| Camera does not open for Parley | The camera needs HTTPS or `localhost`. Use the cloudflared tunnel, or **No camera? Paste a code**. |
| Phone cannot load the game | Use `npm run local:lan` with the PC's LAN IP, or a tunnel. Allow Node.js through the Windows firewall. |
| "That Parley code is invalid or expired" | Codes live about 2 minutes. Tap **New code**. A pair can Parley once per (demo) day. |
| "Not enough sailing charges" | Wait for a lantern to refill (1 minute in demo). |
| Puzzle closed or the voyage was lost | Both captains must solve within 60 s of the join. After that, anyone can **Mark lost**. Charges are not refunded. |
| Bounty never shows on L1 / escrow never registers the raid | The relayer is not delivering. Locally, check that `npm run local` is still running. On testnet, check that the hosted relayer is running, funded on both chains, accepts zero-fee messages, and covers both directions. |
| Wallet reports a nonce error after restarting local | Clear the test account's activity data in the wallet. Local chains reset on every start. |
| Testnet suddenly unreachable | The free managed L1 nodes and relayer stop after about 3 days. Redeploy with [deployment.md](deployment.md) and re-upload the site. |
