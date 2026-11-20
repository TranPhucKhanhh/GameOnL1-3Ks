# QA report for map input, co-op and raids

Validation uses disposable Anvil chains, MockTeleporter, MockUSDC and browser automation. The changes are based on GitHub main at `18dda44`, which adds a fixed-size island view, note speech bubbles and split browser specs. The manual checklist covers physical phones, camera permissions over HTTPS and a deployed testnet relay.

## Issue results

- **#7**. A single Phaser hit test now handles hover and selection for the visible sign, post and centre lantern. The empty centre sign opens the writing bubble for an eligible captain. Decorative glows, shadows and previews of selected tiles stay passive. [Issue #7](https://github.com/TranPhucKhanhh/GameOnL1-3Ks/issues/7)
- **#10**. Sea islands use the same source-pixel circles that draw their shoreline. Docks use the radius of the actual circular button. Switching scenes clears the outgoing hover cursor. Sea-lane cost bubbles remain informational. Select a route through its dock or lane row. [Issue #10](https://github.com/TranPhucKhanhh/GameOnL1-3Ks/issues/10)
- **#12**. An expired puzzle closes to reveal **Mark lost**, and the UI follows the contract's inclusive solve deadline. A camera stream that resolves after its scan view closes is stopped. [Issue #12](https://github.com/TranPhucKhanhh/GameOnL1-3Ks/issues/12)
- **#13**. L1 keeps the latest cumulative bounty, and an escrow that receives settlement first stays closed when registration arrives. Funding keeps the clicked raid ID across wallet approval and checks the C-Chain's remaining cap before requesting approval. [Issue #13](https://github.com/TranPhucKhanhh/GameOnL1-3Ks/issues/13)

## Files changed

| File | Purpose |
| --- | --- |
| [web/src/map.ts](../web/src/map.ts) | Shared Phaser hit testing for hover and selection, gesture handling and cursor reset. |
| [web/src/main.ts](../web/src/main.ts) | Puzzle deadline, camera stream cleanup and raid funding state. |
| [src/game/BossRaid.sol](../src/game/BossRaid.sol) and [src/escrow/RaidEscrow.sol](../src/escrow/RaidEscrow.sol) | Preserve the cumulative funding total and terminal escrow status across message ordering. |
| [test/LanternSea.t.sol](../test/LanternSea.t.sol) and [scripts/e2e.mjs](../scripts/e2e.mjs) | Contract invariants and two-chain mock relay coverage. |
| [test/browser/map.spec.mjs](../test/browser/map.spec.mjs) and [test/browser/note-pole.spec.mjs](../test/browser/note-pole.spec.mjs) | Pointer geometry and writing or reading from the centre sign. |
| [test/browser/parley.spec.mjs](../test/browser/parley.spec.mjs), [test/browser/coop-voyage.spec.mjs](../test/browser/coop-voyage.spec.mjs) and [test/browser/raid-cabinet.spec.mjs](../test/browser/raid-cabinet.spec.mjs) | Shared maps, synthetic QR scanning, the puzzle deadline and three-captain raid workflows. |
| [README.md](../README.md) and [docs/testing.md](testing.md) | Document the puzzle window and updated test coverage. |
| [docs/qa-issues-7-10-12-13.md](qa-issues-7-10-12-13.md) | Test evidence, manual checklist and GitHub drafts. |

## Command results

| Command | Result |
| --- | --- |
| `npm run check` | PASS · repository lint, 26 Foundry tests, ABI sync, TypeScript and Vite build. |
| `npm run test:e2e` | PASS · two Anvil chains and the mock relay, including both funding and refund transactions. |
| `npm run test:deploy` | PASS · deployment and peer binding on disposable Anvil chains 202611 and 43113. |
| `npm run test:ui` | PASS · all 9 Chromium tests, including note bubbles, pointer geometry, mobile zoom and the three-captain raid. |

Playwright saves the desktop and phone-sized hit-area overlays and raid screenshots under `test-results/`.

## QA matrix

### Map input

| Issue | Check | Evidence |
| --- | --- | --- |
| #7 | Sign, post, lantern and nearby empty space | PASS · Playwright probes individual positions and checks cursor and selection on desktop and phone-sized canvases. |
| #7 | Debug and zoom | PASS · Playwright captures Phaser `enableDebug` outlines. For the pole, Phaser shows the bounding box and the pointer probes verify the rounded solid shape within it. |
| #10 | Island shoreline and water, dock centre and perimeter, hover and tap parity | PASS · Playwright checks both viewport sizes and verifies a drag does not select an island. |
| #10 | Sea-lane cost bubbles | PASS · Clicking the read-only indicator has no effect. Dock selection and the lane list expose the existing actions. |

### Co-op

| Item | Automated evidence | Physical phones |
| --- | --- | --- |
| Show code, scan, paste, share both maps and enforce once per pair per day | PASS · Playwright displays a QR, pastes it, verifies both shared maps and scans the QR through a synthetic video track. Foundry tests the daily limit. | BLOCKED · two phones and HTTPS camera session needed |
| Parley jump costs one charge | PASS · Foundry verifies arrival and exactly one charge deducted. | BLOCKED · two phones needed |
| Invite from ⚓4–5 lane, partner accepts and charges split | PASS · Foundry verifies the charge split. Playwright drives the invite and join through the Crew panel. | BLOCKED · two phones needed |
| Both solve within 60 seconds, land and receive fresh island rewards | PASS · Foundry verifies each captain gets 80 coins for a 30-second solve and one gem. A replay to the claimed island lands with no new rewards. Playwright solves both boards. | BLOCKED · two phones needed |
| One captain misses deadline and **Mark lost** | PASS · Foundry verifies deadline, rejection and loss without rewards or landing. Playwright leaves a board open and uses **Mark lost** after the deadline. | BLOCKED · two phones needed |
| Cancel before join and reject wrong account | PASS · Foundry rejects unrelated accounts, verifies cancellation spends no charges and rejects acceptance after cancellation. | BLOCKED · two phones and a third test account needed |
| Sell a gem and check balance | PASS · Foundry verifies one fewer gem and the exact coin value. | BLOCKED · two-phone session unavailable |

### Raid and escrow

| Item | Automated evidence | Deployed testnet |
| --- | --- | --- |
| Partner accepts and relay opens escrow | PASS · Foundry verifies partner authorization. Two-chain test checks escrow registration through the mock relay. | BLOCKED · deployed Game L1, Fuji escrow and live relay needed |
| Two leads get test USDC, fund the bounty, see it on L1 and enforce the 100 USDC cap | PASS · Foundry and two-chain tests verify the combined cap. Playwright funds 10 plus 90 MockUSDC and verifies one more is rejected. | BLOCKED · test wallets and deployed testnet contracts needed |
| Helper spends one charge and appears on damage board, lead attacks with combined power | PASS · Foundry checks charge and board entry. Playwright observes 10 helper damage and 70 lead damage after gear changes. | BLOCKED · three live captains needed |
| Ship upgrade and parts change raid power | PASS · Foundry checks combined power. In Playwright, individual power rises from 10 to 15 with an upgrade and to 25 with a part. | BLOCKED · live raid session needed |
| Boss defeated, settle, helpers paid by share, funders receive remainder, boss coins and Claim | PASS · Foundry verifies one exact helper share, two proportional refunds, both lead coin rewards, Claim and escrow solvency. | BLOCKED · live winning raid and relay needed |
| Boss survives the 10-minute epoch and both funders receive full refunds | PASS · Foundry advances the local chain across the deadline and checks both full refunds and zero helper payout. | BLOCKED · live timed raid and relay needed |
| **Settle last raid** for previous epoch | PASS · Foundry settles the previous ID after rollover. Playwright exercises the previous-raid button and Claim. | BLOCKED · live epoch rollover and relay needed |

## Manual checklist

Run `npm run local` and follow the [phone setup](local-development.md#play-on-a-phone) for the HTTPS tunnel. Use independent browser sessions with guest captains A, B and, for authorization checks, C. Record player addresses, which route or raid is selected, and balances before and after each action.

1. **Map**. Open a visited island with a centre pole, a second pole and a dock. Verify the fitted island view at desktop and phone sizes. Click or tap the sign, post and lantern. Try the empty side of the post's tile, the rounded sign corners and water just past the dock stroke. Verify the dock selects the matching lane row. On an island without notes, tap the **?** sign to open the writing bubble. At sea, try a shoreline lobe, transparent water and a cost bubble at several zoom levels. Only the shoreline should open an island. Start a drag on the artwork and verify that it pans the map. In the local desktop console, inspect the active scene with `window.__lantern.map.game.scene.getScene('island')` or `getScene('sea')`. For each interactive child of `scene.layer.list`, call `scene.input.enableDebug(obj)`. Composite shapes have rectangular debug bounds, so use pointer probes for the exact interior.
2. **Parley**. A displays a fresh code and B scans it using the rear camera. Verify each sees the other's islands. Try the same pair again in the same five-minute demo day, then try a fresh text code after the demo day rolls over. From B, visit a shared island and check that only one charge was spent. Capture balances away from a charge regeneration boundary.
3. **Successful voyages**. Find a crew lane that reaches an unclaimed island with both captains at three charges. Invite, join and compare the deducted shares to the lane cost. Complete both boards within 60 seconds after joining. Both captains must visit the island and gain coins and a gem. Repeat the lane after charges refill and verify that landing on the claimed island adds neither reward. From **Cabinet**, sell the gem and compare the exact coin increase to its displayed price.
4. **Lost or cancelled voyages**. Open a board and let one captain finish while the other waits past the deadline. Verify **Mark lost** is available and changes the status to **Lost at sea**. For a fresh proposal, verify C has no **Join** button and either intended captain can cancel before join without spending charges. Repeat the direct authorization check locally with `npm run forge -- test --match-test testCoopRejectsWrongAccountAndCancelsWithoutCharge`.
5. **Raid setup and combat**. For the real ICM pass, use a configured [Fuji and Game L1 testnet deployment](deployment.md). A proposes and B accepts early in an epoch. Confirm `RaidOpened` and the escrow's `RaidRegistered`. Both leads provision test USDC from the testnet faucet and fund, for example, 60 and 40. Confirm both `Funded` transactions, a 100 USDC bounty on L1 and rejection of any increase. C attacks and confirms one charge spent and its damage shown. Compare A and B's crew attack to displayed crew power, then purchase a part or upgrade and repeat.
6. **Win**. Prepare upgraded ships in advance and use an early, lower-HP boss tier. Record helper damage and total damage before settling. After **Settle**, compare each helper credit to `floor(bounty × helperDamage / totalDamage)`. Check A's refund against `floor(remainder × fundedA / bounty)` and B's refund against the rest. Both leads should receive half the displayed boss coins. Verify **Claim** on C-Chain and capture receipts for both chains.
7. **Timeout and previous raid**. Fund a second raid with different amounts from both leads. Leave the boss alive until the next epoch, choose **Settle last raid**, then verify both deposits are fully claimable and the helper gains nothing. Claim both deposits and capture the old raid ID and receipts.

## GitHub comment drafts

### Issue #7

Note-pole hover and selection now use the actual sign, post and lantern. Clicks beside the post on the same tile and in the corners outside the sign do not open the note. Playwright covers desktop and phone-sized viewports with different camera zooms and captures the Phaser debug bounds.

### Issue #10

The island shoreline is hit-tested in source texture pixels. The shore dock uses the same circle for its drawing and interaction. Playwright covers hover, tap, transparent water, the outside of the dock and dragging on both viewport sizes. Sea-lane cost markers remain informational, with route actions available through the dock and lane list.

### Issue #12

The local test suite covers both shared maps, the one-charge jump, daily Parley limits, charge splitting, fresh and repeated landings, timeouts, cancellation, wrong-account joins and gem sales. The puzzle now closes after the solve window so the captain can mark the voyage lost. QR paste and synthetic-video scanning are covered by browser automation. The physical two-phone HTTPS and camera pass is pending.

### Issue #13

The local suite covers registration through MockTeleporter, funding by both leads and the combined cap, helper and crew damage, upgrades, win payouts, full timeout refunds and previous-epoch settlement. It also covers out-of-order messages so a delayed funding receipt cannot lower the displayed bounty, and a delayed registration cannot reopen settled escrow. The deployed Fuji/Game L1 and live ICM pass is pending.

## Bug report drafts

### Expired crew puzzle covers Mark lost

Join a crew voyage, leave the puzzle open and wait past its deadline. Previously the board stayed above the Crew panel at zero seconds. Expected behavior is for the board to close and **Mark lost** to become available. Covered by the Playwright timeout scenario.

### Closing the QR scanner during camera permission can leave the camera running

On a secure origin, start scanning, close the scan view while the camera request is pending, then allow it. Previously a stream returned by the pending request could attach to a detached video element. Expected behavior is for the resulting tracks to be stopped. Identified during frontend review. Native permission prompt reproduction is NOT RUN.

### The map can keep a hand cursor over empty space after changing scenes

Hover an island, then go ashore while the pointer is still over the island artwork. The outgoing scene can sleep before it sends its pointer-out event, leaving the hand cursor active in the island view. Expected behavior is to clear the cursor when the scene changes and show the hand on the next interactive target. Covered by the Phaser browser test.

### Delayed funding receipts can lower the raid bounty displayed on L1

On local mocks, fund with 15 test USDC from the first lead and 20 from the second, then deliver the cumulative 35 receipt before the 15 receipt. Previously L1 ended at 15 while escrow held 35. Expected behavior is for L1 to retain the higher cumulative total. Covered by Foundry.

### A delayed registration can open escrow after settlement

On local mocks, hold the raid-opening message, settle after timeout, then deliver settlement before opening. Previously settlement was ignored for the unregistered ID and the late opening left it marked open. Expected behavior is for the escrow to record settlement and remain closed. Covered by Foundry.

### Pending bounty approval can submit funding for the wrong epoch

Start funding near an epoch boundary and let the app refresh while the wallet approval remains pending. The previous handler read the latest raid ID again for the funding transaction. Expected behavior is for funding to target the originally displayed raid, subject to its deadline, and for the remaining cap to be checked before approval. Identified during frontend review. Native wallet-delay reproduction is NOT RUN.
