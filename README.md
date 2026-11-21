# Lantern Sea

A co-op pirate exploration game on **your own Avalanche L1**, with raid bounties escrowed in **test USDC on Fuji C-Chain** and synced over **Avalanche ICM (Teleporter)**. Built for Team1 Vietnam UniHack 2026.

Every captain gets a home island, three sailing charges and a sea that nobody has mapped yet.

- **Explore:** each island shows 1–4 sea lanes. You see each lane's direction and cost (⚓1 or ⚓2), but not where it leads. Lanes leave only from the island where your ship is moored (the contract enforces this). Every island you reach opens new lanes, and **Sail to** moves the ship between islands you already know for no charge.
- **Crew lanes:** these cost ⚓4–5, more than one captain can hold, so two captains must pool charges. Then both must solve a 4×4 sliding puzzle within 60 seconds of joining. When a crew lands on an unclaimed island, each captain earns a gem.
- **Collisions:** the sea is a small hash space on purpose. You will stumble onto other captains' islands and bases.
- **Go ashore:** on the island where your ship is, tap **Go ashore** to walk its hash-generated land. Build a note pole for 25 coins: the first pole stands in the centre, and later ones go on any free spot you pick. Tap a pole to read it.
- **Parley:** meet in person and scan each other's QR code. For a while your maps are shared: you can **visit** any of your partner's islands for free to go ashore and read its notes, or jump there for good for ⚓1. A raid's two lead captains can visit each other's islands the same way while their raid lasts. When the Parley or raid ends, a visiting ship is back at its home island automatically.
- **Debug coins (local demo only):** Help → Debug adds 100 or 1000 free in-game coins on the local chain.
- **Ship:** five part slots and two upgradable stats, damage and multiplier. Parts can add damage, add multiplier, or multiply total power.
- **Boss raids:** a co-op crew leads a time-limited boss raid. They can escrow test USDC on C-Chain as a bounty. Helpers spend charges to attack. If the boss falls, helpers are paid by damage share, and the rest goes back to the crew.

**No randomness, no sponsor pool, no cash-out.** Rewards depend only on lane cost, daily streak and puzzle speed. Coins and gems are free in-game points: they cannot be bought and never convert to money. The only money in the game is test USDC that one lead crew puts into its own raid.

> **Demo time:** local and demo deployments speed up time to one charge per minute and 10-minute bosses (normally 3 charges per 8 hours and daily bosses). Only test tokens are used. This is an educational game, not a financial service.

## Quick start (Windows, local)

Commands below are for **Command Prompt (CMD)**; the npm commands also work in PowerShell.

Requirements: Node.js 22.12+, Git, and Foundry (`forge`, `cast`, `anvil`). `npm run foundry:install` downloads a checksummed Foundry build into `.tools/`.

```bat
npm ci
```

```bat
npm run local
```

Open **http://127.0.0.1:5173** and choose **Play as a local guest captain**. Each browser tab gets its own throwaway key, so **two tabs means two captains**: enough to try Parley, crew voyages and raids alone. Keep the terminal open, and press `Ctrl+C` to stop. Every start creates fresh local chains.

To test on a phone, see [local development](docs/local-development.md#play-on-a-phone).

## Check everything

```bat
npm run check
```

```bat
npm run test:e2e
```

```bat
npm run test:ui
```

These run the Foundry contract suite, the frontend build, an end-to-end test on two local chains with a simulated ICM relay, and browser tests for co-op, raids and map interaction. See [testing](docs/testing.md).

## Docs

- [Architecture and game rules](docs/architecture.md)
- [Local development and phone testing](docs/local-development.md)
- [Deploy to Fuji and your own L1 with ICM](docs/deployment.md)
- [Testing](docs/testing.md) · [Troubleshooting](docs/troubleshooting.md)
- [Hackathon rules check and pitch notes](docs/competition.md)
- [References](docs/references.md)
