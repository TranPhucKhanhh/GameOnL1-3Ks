# Hackathon rules check and pitch notes

[← README](../README.md)

These were checked against team1vn.xyz and topics.json on **18/11/2026**. Recheck before submitting, because the organizers may update them.

- **Deadline:** **23:59, 21/11/2026 (UTC+7)** on team1vn.xyz. Press **Submit**; a saved draft does not count.
- **What to submit:** a GitHub repo (public, or private with `tuantqse90` invited), Canva or Google Slides, a **2–3 minute** demo video, and any supporting docs.
- **Access:** every link must open for the judges.
- **Finals:** top 10, 30/11/2026 at Greenwich Vietnam, Ho Chi Minh City.

Lantern Sea is the team's **own idea**. It is not suggested topic 10 or 11, but it uses the same Game-L1 + C-Chain + ICM design.

## Rule-by-rule

| Rule (topics.json general rules) | How Lantern Sea complies |
| --- | --- |
| No randomness, loot boxes or random rewards | Rewards depend only on lane cost, daily streak and puzzle speed. The hash only shapes the map, and crew islands always give their gem. |
| Avalanche environment | Own Subnet-EVM L1 on Fuji plus Fuji C-Chain. Test tokens only. |
| Non-custodial by default; pooled funds only behind a multisig | Wallets hold all funds. The only escrow holds one raid's bounty from its two lead captains, has no admin key, and always refunds. **Ask the organizers to confirm that per-raid escrow is acceptable.** |
| No personal data on-chain | Only addresses, game state and short notes are stored on-chain, and the UI warns players not to write personal information. Parley stores a signature check, not a location. |
| Declare dev toggles | Demo time (1 charge per minute, 10-minute bosses) is fixed at deployment and shown in the app's banner. **Say it in the first 10 seconds of the pitch and video.** |
| Mock yield must name a real source | There is **no yield at all**. Bounty money is the lead crew paying for help. No tokens are minted. |
| Vietnamese law | See below. |
| Why on-chain, why Avalanche, where the money comes from | See below. |

## The three required answers

- **Why on-chain?** Strangers who meet in person, or who join a raid, need to trust that the bounty is really escrowed and will be paid by damage share without trusting our server. Island claims, notes and the puzzle check are all publicly verifiable.
- **Why Avalanche?** Exploration, puzzles and attacks create many small transactions, so they run on our own L1 with a free gas token. Money stays on C-Chain with real test USDC. ICM connects the two natively, without a third-party bridge.
- **Where does the money come from?** Only from players: the lead crew pays helpers for help it chose to buy. There is no sponsor pool, no yield and no minted reward token. Coins and gems cannot be bought or cashed out.

## Legal and Vietnam notes for the pitch

- This is an educational game prototype on **testnets with test tokens**. It accepts no real money and sells no token.
- Crypto is not legal tender in Vietnam. A real launch would need legal review, including Vietnam's rules on online games and on exchanging in-game items for money. That is why coins and gems never convert to money.
- The game gives no financial or legal advice.

## Video script (2–3 minutes)

| Time | Scene |
| --- | --- |
| 0:00–0:15 | "Demo time is sped up: one charge per minute, 10-minute bosses. Test tokens only." Show the banner. |
| 0:15–0:40 | Claim a home island, sail a ⚓1 lane into the fog, and get 10–20 coins (the range is set by your streak). |
| 0:40–1:05 | Two phones Parley by QR. The maps merge, and one captain jumps to a crewmate's island for ⚓1. |
| 1:05–1:35 | A crew lane (⚓4–5) pools charges from both captains. Both solve the sliding puzzle. They land and both get a gem. |
| 1:35–2:15 | The crew leads a boss raid and escrows 10 USDC on Fuji. Show the ICM messages in both explorers. A helper attacks, the raid is settled, and the helper claims their damage share. |
| 2:15–2:45 | Architecture slide, the rules check, limitations, and next steps (Bluetooth/NFC proximity, island decoration, seed market for coins). |

## Submission checklist

- [ ] Fresh deployment on L1 and Fuji ([deployment.md](deployment.md)), hosted over HTTPS, with a real ICM round trip recorded.
- [ ] Repo public, or `tuantqse90` invited. Slides and video open in a logged-out window.
- [ ] The pitch opens with the demo-time declaration and covers the three answers and the law notes.
- [ ] Organizers asked in Telegram about per-raid escrow, and their answer noted in the slides.
- [ ] Submit pressed before 23:59, 21/11/2026 (UTC+7).
