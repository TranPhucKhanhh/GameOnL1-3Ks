# Testing

[← README](../README.md)

| Command | What it proves |
| --- | --- |
| `npm run test:contracts` | 24 Foundry tests (`test/LanternSea.t.sol`): registration, charge regeneration and caps, cost-based coin ranges, the streak, claimed islands paying nothing, the co-op flow (puzzle replay, window, wrong solution, crew-only join), note poles (coin cost, centre first, free land tiles only, one per captain, visit required), island land shape, Parley signatures (forged, expired, too-long-lived, once per day), ship parts and the multiplier maths, gem sales, raid open → fund → settle with the helper damage-share payout and the refund split, failed raids, escrow expiry, funding caps and deadlines, forged ICM messages, and a fuzz test showing the scramble inverse always solves. |
| `npm run check` | Contract tests, ABI sync, TypeScript check and the production build. |
| `npm run test:e2e` | Two Anvil chains plus the mock relayer. Checks that the browser's hash geometry and island land tiles equal the contract's, then runs a solo sail, a full co-op voyage (both puzzles solved on-chain), a Parley signature, and a raid ICM round trip (open, fund, settle as failed, refund, claim) with an escrow solvency check. |
| `npm run test:deploy` | Runs the real Forge `DeployGame` / `DeployEscrow` / `Bind*` scripts on disposable chains with IDs 202611 and 43113, and checks the wiring. |
| `npm run test:ui` | Playwright with two guest captains on phone-size screens: register, Parley by code, crew voyage with both sliding puzzles solved by tapping, going ashore and building the centre note pole, sailing a lane with the voyage animation and landing on the new island, raid lead, USDC escrow, and attack. It also checks the read-only cabinet link on desktop, checks that nothing covers the desktop map and fails on any page error. Screenshots go to `test-results/`. |

`test:e2e`, `test:deploy` and `test:ui` each start their own chains on ports 8545 and 9545 (and 5173 for the UI test). Stop `npm run local` before running them.

The CI workflow `.github/workflows/ci.yml` runs all of these on every push.
