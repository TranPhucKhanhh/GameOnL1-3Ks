# Testing

[← README](../README.md)

| Command | What it proves |
| --- | --- |
| `npm run test:contracts` | Foundry checks sailing (lanes only from the island where the ship is moored, free moves between known islands), notes, Parley signatures, co-op charge splits, fresh and repeat landings, cancellation, gem sales, gear, and raid payouts and refunds. It also checks the combined funding cap, escrow solvency, message authentication and out-of-order raid messages. |
| `npm run check` | Repository lint, contract tests, ABI sync, TypeScript check and the production build. |
| `npm run test:e2e` | Two Anvil chains plus the mock relayer. Checks browser geometry against the contract, solo and co-op voyages, a Parley signature and a raid round trip with both funders, the combined cap, a helper attack, previous-epoch settlement and both refunds claimed. |
| `npm run test:deploy` | Runs the real Forge `DeployGame` / `DeployEscrow` / `Bind*` scripts on disposable chains with IDs 202611 and 43113, and checks the wiring. |
| `npm run test:ui` | Playwright on phone (`360×740`, `390×844`) and desktop (`1280×800`) viewports: mobile HUD/tab/button sizing, single-line demo banner and collapsible bottom sheet, Parley paste and synthetic-camera scanning, co-op puzzles and timeout, note bubbles, sailing, sea zoom, ship gear, map hover/click/tap targets, a three-captain raid with funding, attacks, previous-epoch settlement and Claim, plus the remaining buttons (mult upgrade, gem sale, voyage cancel, Parley jump, copy link, exit view, disconnect). It also checks the read-only cabinet link on desktop and fails on any page error. Screenshots go to `test-results/`. |

`test:e2e`, `test:deploy` and `test:ui` each start their own chains on ports 8545 and 9545 (and 5173 for the UI test). Stop `npm run local` before running them.

The CI workflow `.github/workflows/ci.yml` runs all of these on every push.

See the [QA report and manual checklist](qa-issues-7-10-12-13.md) for issues #7, #10, #12 and #13.

CI (`.github/workflows/ci.yml`) caches the Playwright Chromium download and skips `--with-deps`: the runner image already has Chrome's system libraries, and the apt step took about 7 minutes. (The Playwright Docker image rendered the map about 3x slower, so it is not used.) Only `main` runs on push; pull requests run once per commit, and a newer commit cancels the older run.
