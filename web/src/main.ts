import { formatUnits, isAddress, parseUnits, toHex, type Abi, type Address, type Hex } from 'viem';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import seaAbiJson from './generated/LanternSea.json';
import coopAbiJson from './generated/CoopSail.json';
import yardAbiJson from './generated/Shipyard.json';
import raidAbiJson from './generated/BossRaid.json';
import escrowAbiJson from './generated/RaidEscrow.json';
import usdcAbiJson from './generated/MockUSDC.json';
import { guestSigner, injectedSigner, pub, read, transact, type Config, type Network, type Signer } from './chain';
import { SeaMap, islandPos, type IslandData } from './map';
import { THEMES } from './art';
import { ICONS } from './icons';
const COIN = `<i class="ci">${ICONS.coin}</i>`;
import { lanes, islandName, gemTypeOf, islandTheme, decodeBoard, NOTE_COST, CENTER_TILE, isSolved, moveForTap, moveBlank, GEMS, GEM_PRICE } from './world.js';
import './style.css';

const seaAbi = seaAbiJson as Abi, coopAbi = coopAbiJson as Abi, yardAbi = yardAbiJson as Abi;
const raidAbi = raidAbiJson as Abi, escrowAbi = escrowAbiJson as Abi, usdcAbi = usdcAbiJson as Abi;

// ------------------------------------------------------------------ types & static data

type CaptainView = { registered: boolean; home: number; charges: number; nextChargeAt: bigint; streak: number; sails: number;
  islandsFound: number; coins: bigint; gems: readonly bigint[]; visitedCount: bigint };
type Note = { author: Address; at: bigint; tile: number; text: string };
type Voyage = { id: bigint; a: Address; b: Address; from: number; to: number; dir: number; cost: number; aCharges: number;
  status: number; startedAt: bigint; aSolvedAt: bigint; bSolvedAt: bigint; fresh: boolean };
type RaidView = { leadA: Address; leadB: Address; status: number; settled: boolean; island: number; proposedAt: bigint;
  deadline: bigint; maxHp: bigint; hp: bigint; totalDamage: bigint; bounty: bigint };
type Stats = { damage: bigint; mult: bigint; xMult: bigint; power: bigint };
type Tab = 'island' | 'ship' | 'crew' | 'raid' | 'cabinet' | 'help';

const PARTS = [
  { id: 1, slot: 0, name: 'Oak Hull', fx: '+20 damage', price: 100 },
  { id: 2, slot: 0, name: 'Iron Hull', fx: '+50 damage', price: 300 },
  { id: 3, slot: 0, name: 'Coral Hull', fx: '+0.50 mult', price: 350 },
  { id: 4, slot: 1, name: 'Canvas Sails', fx: '+0.30 mult', price: 120 },
  { id: 5, slot: 1, name: 'Silk Sails', fx: '+0.60 mult', price: 320 },
  { id: 6, slot: 1, name: 'Storm Sails', fx: '×1.2 power', price: 500 },
  { id: 7, slot: 2, name: 'Bronze Cannon', fx: '+30 damage', price: 150 },
  { id: 8, slot: 2, name: 'Twin Cannons', fx: '+60 damage', price: 400 },
  { id: 9, slot: 2, name: 'Dragon Cannon', fx: '×1.5 power', price: 800 },
  { id: 10, slot: 3, name: 'Mermaid Figurehead', fx: '+0.40 mult', price: 200 },
  { id: 11, slot: 3, name: 'Lantern Figurehead', fx: '+40 dmg, +0.20 mult', price: 450 },
  { id: 12, slot: 3, name: 'Kraken Figurehead', fx: '×1.3 power', price: 600 },
  { id: 13, slot: 4, name: 'Jolly Flag', fx: '+10 damage', price: 50 },
  { id: 14, slot: 4, name: 'Crimson Flag', fx: '+0.20 mult', price: 150 },
  { id: 15, slot: 4, name: 'Lantern Banner', fx: '×1.1 power', price: 300 }
];
const SLOTS = ['Hull', 'Sails', 'Cannon', 'Figurehead', 'Flag'];
const BOSSES = ['Tide Wraith', 'Iron Leviathan', 'Coral Hydra', 'Storm Kraken'];
const VOYAGE_STATUS = ['—', 'Waiting for crewmate', 'Sailing (puzzle!)', 'Landed', 'Lost at sea', 'Cancelled'];
const RAID_STATUS = ['No raid', 'Lead proposed', 'Active', 'Defeated', 'Failed'];
const ZERO = '0x0000000000000000000000000000000000000000';

// ------------------------------------------------------------------ state

const app = document.querySelector<HTMLDivElement>('#app')!;
let config: Config;
let seed: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
let mapSize = 256, demo = true, coopWindow = 60;
let signer: Signer | null = null;
let viewAs: Address | null = null; // read-only Treasure Cabinet link
let me: CaptainView | null = null;
let visited: number[] = [];
const homes = new Map<number, Address[]>();
let partners: { who: Address; until: number }[] = [];
let sharedWith: Address | null = null;
let partnerVisited = new Set<number>();
let selected: number | null = null;
let inside: number | null = null; // island whose interior is on screen
let placing = false, pickTile: number | null = null, selectedNote: number | null = null, focusLane: number | null = null;
let island: { finder: Address; notes: Note[]; homes: Address[] } | null = null;
let tab: Tab = 'island';
let stats: Stats | null = null, equipped: number[] = [0, 0, 0, 0, 0], dmgLevel = 0, multLevel = 0;
let voyages: Voyage[] = [];
let raidId = 0n, raidView: RaidView | null = null, boss: { island: number; maxHp: bigint; coins: bigint; endsAt: bigint } | null = null;
let lastRaid: { id: bigint; view: RaidView } | null = null;
let helpers: { who: Address; dmg: bigint }[] = [];
let myDamage = 0n, crewPower = 0n, usdcBalance = 0n, claimable = 0n;
let puzzle: { id: bigint; cells: number[]; moves: number[]; deadline: number; submitting: boolean } | null = null;
const dismissedPuzzles = new Set<string>();
let overlay: 'none' | 'qr' | 'scan' = 'none';
let qr: { url: string; code: string; expiry: number } | null = null;
let busy = '', notice = '', noticeError = false, clearForms = false;
let coopForm: { dir: number } | null = null;
let sheetMin = false;
let renderedTab: Tab | null = null;
let renderedInside: boolean | null = null;
let renderedHud = '', renderedSheet = '', renderedOverlayKey = '', clearFormsApplied = false;
const txs: { hash: string; label: string; network: Network }[] = [];
let map: SeaMap | null = null;
let scanStop: (() => void) | null = null;

const now = () => Math.floor(Date.now() / 1000);
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd = (n: bigint) => Number(formatUnits(n, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const who = () => signer?.address ?? viewAs;
const mine = (a: string) => same(a, signer?.address);
const name = (a: string) => mine(a) ? 'you' : short(a);
function left(seconds: number) {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
const FRIENDLY: [RegExp, string][] = [
  [/NotEnoughCharges/, 'Not enough sailing charges. Wait for your lanterns to refill.'],
  [/CoopRequired/, 'This lane needs a crew: plan a co-op voyage.'],
  [/NotEnoughCoins/, 'Not enough coins.'],
  [/AlreadyNoted/, 'You already left a note on this island.'],
  [/ParleyUsedToday/, 'You two already held a Parley today.'],
  [/BadParley/, 'That Parley code is invalid or expired. Ask for a fresh code.'],
  [/WrongSolution/, 'The puzzle is not solved yet.'],
  [/BadTile/, 'That spot is taken or in the water. Tap one of the glowing spots.'],
  [/WindowClosed/, 'Too late: the 60-second window closed.'],
  [/HelpersFull/, 'This raid already has 20 helpers.'],
  [/FAUCET_COOLDOWN/, 'Test USDC faucet: once per hour.'],
  [/User (rejected|denied)/i, 'Cancelled in wallet.']
];

// ------------------------------------------------------------------ actions

async function act(label: string, fn: () => Promise<void>) {
  if (busy) return;
  busy = label; noticeError = false; render();
  try { await fn(); clearForms = true; }
  catch (error) {
    const e = error as { shortMessage?: string; message?: string };
    const raw = `${e.shortMessage ?? ''} ${e.message ?? ''}`;
    notice = FRIENDLY.find(([re]) => re.test(raw))?.[1] ?? (e.shortMessage || e.message || 'Action failed.').slice(0, 300);
    noticeError = true;
  } finally { busy = ''; await refresh(); render(); }
}

async function tx(n: Network, address: Address, abi: Abi, fn: string, args: unknown[], label: string) {
  if (!signer) throw new Error('Connect first.');
  busy = `${label}…`; render();
  const { hash } = await transact(signer, n, address, abi, fn, args);
  txs.unshift({ hash, label, network: n }); txs.splice(10);
  notice = `${label}: done.`;
}

async function connect(kind: 'guest' | 'injected') {
  signer = kind === 'guest' ? await guestSigner(config) : await injectedSigner();
  viewAs = null;
  notice = kind === 'guest' ? 'Guest captain ready (this tab only). Open another tab for a second captain.' : 'Wallet connected.';
  me = null; visited = []; selected = null; island = null;
}

// ------------------------------------------------------------------ reads

async function loadIsland(n: number) {
  const [finder, count, hs] = await Promise.all([
    read<Address>(config.game, config.sea, seaAbi, 'firstFinder', [n]),
    read<bigint>(config.game, config.sea, seaAbi, 'noteCount', [n]),
    read<Address[]>(config.game, config.sea, seaAbi, 'homesOn', [n])]);
  const notes = count > 0n ? await read<Note[]>(config.game, config.sea, seaAbi, 'getNotes', [n, 0n, 50n]) : [];
  if (selected === n) island = { finder, notes, homes: hs };
}

async function loadHomes() {
  try {
    const logs = await pub(config.game).getContractEvents({ address: config.sea, abi: seaAbi, eventName: 'CaptainRegistered', fromBlock: 0n });
    homes.clear();
    for (const l of logs as unknown as { args: { captain: Address; home: number } }[]) {
      const list = homes.get(Number(l.args.home)) ?? [];
      list.push(l.args.captain);
      homes.set(Number(l.args.home), list);
    }
  } catch { /* some RPCs limit log ranges; bases still show when you land */ }
}

async function loadPartners(addr: Address) {
  try {
    const [asA, asB] = await Promise.all([
      pub(config.game).getContractEvents({ address: config.sea, abi: seaAbi, eventName: 'ParleyStarted', args: { a: addr }, fromBlock: 0n }),
      pub(config.game).getContractEvents({ address: config.sea, abi: seaAbi, eventName: 'ParleyStarted', args: { b: addr }, fromBlock: 0n })]);
    const map = new Map<string, { who: Address; until: number }>();
    for (const l of [...asA, ...asB] as unknown as { args: { a: Address; b: Address; until: bigint } }[]) {
      const other = same(l.args.a, addr) ? l.args.b : l.args.a;
      const until = Number(l.args.until);
      const prev = map.get(other.toLowerCase());
      if (!prev || prev.until < until) map.set(other.toLowerCase(), { who: other, until });
    }
    partners = [...map.values()].sort((x, y) => y.until - x.until);
  } catch { partners = []; }
  if (sharedWith && !partners.some(p => same(p.who, sharedWith) && p.until >= now())) sharedWith = null;
  if (!sharedWith) sharedWith = partners.find(p => p.until >= now())?.who ?? null;
  partnerVisited = sharedWith
    ? new Set((await read<readonly number[]>(config.game, config.sea, seaAbi, 'visitedIslands', [sharedWith])).map(Number))
    : new Set();
}

async function loadVoyages(addr: Address) {
  const count = await read<bigint>(config.game, config.coop, coopAbi, 'voyageCount');
  const ids: bigint[] = [];
  for (let i = count; i > 0n && ids.length < 30; i--) ids.push(i);
  const rows = await Promise.all(ids.map(id => read<readonly unknown[]>(config.game, config.coop, coopAbi, 'voyages', [id])));
  voyages = rows.map((r, i) => ({ id: ids[i], a: r[0] as Address, b: r[1] as Address, from: Number(r[2]), to: Number(r[3]),
    dir: Number(r[4]), cost: Number(r[5]), aCharges: Number(r[6]), status: Number(r[7]), startedAt: r[8] as bigint,
    aSolvedAt: r[9] as bigint, bSolvedAt: r[10] as bigint, fresh: r[11] as boolean }))
    .filter(v => same(v.a, addr) || same(v.b, addr));
  // Auto-open the puzzle for both crewmates as soon as the voyage starts.
  const live = voyages.find(v => v.status === 2 && Number(v.startedAt) + coopWindow > now()
    && (same(v.a, addr) ? v.aSolvedAt === 0n : v.bSolvedAt === 0n));
  if (live && !puzzle && !dismissedPuzzles.has(String(live.id)) && signer) {
    const board = await read<bigint>(config.game, config.coop, coopAbi, 'puzzleOf', [live.id, addr]);
    puzzle = { id: live.id, cells: decodeBoard(board), moves: [], deadline: Number(live.startedAt) + coopWindow, submitting: false };
  }
}

async function loadRaid(addr: Address | null) {
  raidId = await read<bigint>(config.game, config.raid, raidAbi, 'currentRaidId');
  const [b, view, prev] = await Promise.all([
    read<readonly [number, bigint, bigint, bigint]>(config.game, config.raid, raidAbi, 'bossOf', [raidId]),
    read<RaidView>(config.game, config.raid, raidAbi, 'raidView', [raidId]),
    read<RaidView>(config.game, config.raid, raidAbi, 'raidView', [raidId - 1n])]);
  boss = { island: Number(b[0]), maxHp: b[1], coins: b[2], endsAt: b[3] };
  raidView = view;
  lastRaid = prev.status >= 2 && !prev.settled ? { id: raidId - 1n, view: prev } : null;
  const [list, dmg] = await read<readonly [Address[], bigint[]]>(config.game, config.raid, raidAbi, 'helpersOf', [raidId]);
  helpers = list.map((w, i) => ({ who: w, dmg: dmg[i] })).sort((x, y) => Number(y.dmg - x.dmg));
  if (addr) {
    const lead = same(view.leadA, addr) || same(view.leadB, addr);
    [myDamage, crewPower, usdcBalance, claimable] = await Promise.all([
      read<bigint>(config.game, config.raid, raidAbi, 'damageOf', [raidId, addr]),
      lead && view.status >= 1 ? read<bigint>(config.game, config.shipyard, yardAbi, 'crewPower', [view.leadA, view.leadB]) : Promise.resolve(0n),
      read<bigint>(config.vault, config.usdc, usdcAbi, 'balanceOf', [addr]),
      read<bigint>(config.vault, config.escrow, escrowAbi, 'claimable', [addr])]);
  }
}

let refreshing = false;
async function refresh() {
  if (!config || refreshing) return;
  refreshing = true;
  try {
    const addr = who();
    const jobs: Promise<unknown>[] = [loadRaid(addr ?? null), loadHomes()];
    if (addr) {
      jobs.push((async () => {
        me = await read<CaptainView>(config.game, config.sea, seaAbi, 'captainView', [addr]);
        visited = me.registered ? (await read<readonly number[]>(config.game, config.sea, seaAbi, 'visitedIslands', [addr])).map(Number) : [];
        const [s, eq, dl, ml] = await Promise.all([
          read<Stats>(config.game, config.shipyard, yardAbi, 'statsOf', [addr]),
          read<readonly number[]>(config.game, config.shipyard, yardAbi, 'equippedOf', [addr]),
          read<number>(config.game, config.shipyard, yardAbi, 'damageLevel', [addr]),
          read<number>(config.game, config.shipyard, yardAbi, 'multLevel', [addr])]);
        stats = s; equipped = eq.map(Number); dmgLevel = Number(dl); multLevel = Number(ml);
      })());
      if (signer) jobs.push(loadPartners(addr), loadVoyages(addr));
    }
    await Promise.all(jobs);
    if (selected !== null) await loadIsland(selected);
    if (me?.registered && selected === null) selected = me.home;
  } catch (error) {
    notice = `Cannot reach the chains: ${(error as Error).message.slice(0, 140)}`;
    noticeError = true;
  } finally { refreshing = false; }
  updateMap();
}

function updateInsets() {
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  const sheet = document.querySelector('#sheet')?.getBoundingClientRect();
  if (!map || !hud || !sheet) return;
  const side = sheet.left > 0 && sheet.top <= hud.bottom + 4; // desktop: panel on the right
  map.setInsets(hud.bottom, side ? innerWidth - sheet.left : 0, side ? 0 : innerHeight - sheet.top);
}

function updateMap() {
  if (!map) return;
  const otherHomes = new Set<number>();
  for (const [n, list] of homes) if (list.some(a => !same(a, who()))) otherHomes.add(n);
  map.update({
    seed, mapSize, visited: new Set(visited), partnerVisited, home: me?.registered ? me.home : null,
    ship: me?.registered ? (visited[visited.length - 1] ?? me.home) : null, otherHomes,
    boss: boss?.island ?? null, selected
  });
  if (inside !== null) map.enterIsland(islandData(inside));
}

function islandData(n: number): IslandData {
  const from = islandPos(n, mapSize);
  const known = visited.includes(n);
  return {
    seed, island: n, name: islandName(n), isHome: me?.registered ? me.home === n : false,
    poles: (selected === n ? island?.notes ?? [] : []).map(x => ({ author: x.author, tile: Number(x.tile), text: x.text })),
    docks: known ? lanes(seed, mapSize, n).map(l => {
      const to = islandPos(l.to, mapSize);
      return { dir: l.dir, cost: l.cost, coop: l.coop, angle: Math.atan2(to.y - from.y, to.x - from.x),
        label: visited.includes(l.to) ? islandName(l.to) : '?' };
    }) : [],
    placing, pick: pickTile, selectedPole: selectedNote
  };
}

/** The ship sails across the sea to the island (camera follows), the island pops out of the fog, then we go ashore. */
async function voyageTo(from: number, to: number) {
  const coinsBefore = me?.coins ?? 0n;
  inside = null; placing = false; pickTile = null;
  busy = 'Sailing…'; render();
  await map?.sailTo(from, to);
  if (!visited.includes(to)) visited = [...visited, to];
  selected = to;
  updateMap();
  await refresh();
  const gained = (me?.coins ?? 0n) - coinsBefore;
  map?.floatText(to, gained > 0n ? `+${gained} coins!` : 'Already claimed');
  notice = gained > 0n ? `New island discovered: ${islandName(to)}! +${gained} coins.` : `${islandName(to)} was already claimed. Sign its log or sail on.`;
  await new Promise(r => setTimeout(r, 1100));
  enterIsland(to);
}

function enterIsland(n: number) {
  selected = n; inside = n; island = null; tab = 'island'; coopForm = null; sheetMin = false;
  placing = false; pickTile = null; selectedNote = null; focusLane = null;
  renderedTab = null; // start the panel at the top for the new island
  render();
  void loadIsland(n).then(() => { render(); updateMap(); });
}

// ------------------------------------------------------------------ render: pieces

function hud() {
  const charges = me?.registered ? me.charges : 0;
  const next = me?.registered && me.nextChargeAt > 0n ? left(Number(me.nextChargeAt) - now()) : '';
  const lanterns = Array.from({ length: 3 }, (_, i) => `<i class="lantern ${i < charges ? 'lit' : ''}">${ICONS.lantern}</i>`).join('');
  const gemCount = me ? me.gems.reduce((s, g) => s + g, 0n) : 0n;
  return `<header class="hud">
    <a class="brand" href="./" aria-label="Lantern Sea home"><span class="brand-mark">${ICONS.logo}</span><span class="brand-text"><b>Lantern</b> Sea</span></a>
    <div class="meters">
      <span class="meter charges" title="Sailing charges (max 3)">${lanterns}${next ? `<small>+1 in ${next}</small>` : ''}</span>
      <span class="meter coin" title="Coins (free in-game points)"><i class="mi">${ICONS.coin}</i>${me ? me.coins.toString() : '0'}</span>
      <span class="meter gem" title="Gems"><i class="mi">${ICONS.gem}</i>${gemCount.toString()}</span>
    </div>
    ${signer ? `<button class="chip" data-tab="help" aria-label="Account ${short(signer.address)}"><span class="dot"></span>${short(signer.address)}</button>`
      : `<button class="chip primary" data-act="connect">Connect</button>`}
  </header>`;
}

function connectBox() {
  return `<div class="card intro">
    <h2>Raise your lantern, captain.</h2>
    <p>Claim a home island, sail hidden sea lanes, meet crewmates in person and raid bosses together.</p>
    ${config.mode === 'local' ? `<button class="primary wide" data-act="guest">Play as a local guest captain</button>
      <p class="hint">Local demo only: a throwaway key for this tab. Open a second tab to play a second captain.</p>` : ''}
    <button class="wide ${config.mode === 'local' ? '' : 'primary'}" data-act="injected">Connect MetaMask / Core</button>
    <p class="hint">On a phone, open this page inside your wallet app's browser.</p>
  </div>`;
}

function islandPanel() {
  if (!signer && !viewAs) return connectBox();
  if (viewAs) return `<div class="card"><h2>Viewing ${short(viewAs)}'s sea</h2><p>Read-only cabinet link.</p>
    <button class="wide" data-act="exit-view">Play your own captain</button></div>`;
  if (!me?.registered) return `<div class="card intro"><h2>Claim your home island</h2>
    <p>Your home is picked from your address by the sea's hash. It may sit right next to someone else's.</p>
    <button class="primary wide" data-act="register">Claim my island</button></div>`;
  if (selected === null) return '<div class="card"><p>Tap an island on the map.</p></div>';
  const n = selected;
  const isMine = visited.includes(n);
  const isPartner = !isMine && partnerVisited.has(n);
  const finder = island?.finder;
  const badges = [
    `<span class="badge theme-${islandTheme(seed, n)}">${THEMES[islandTheme(seed, n)].name} island</span>`,
    n === me.home ? '<span class="badge home">Your home</span>' : '',
    ...(island?.homes ?? []).filter(h => !mine(h)).map(h => `<span class="badge base">Base of ${short(h)}</span>`),
    finder && finder !== ZERO ? `<span class="badge">Discovered by ${name(finder)}</span>` : '',
    boss?.island === n ? `<span class="badge boss">☠ ${BOSSES[Number((raidId - 1n) % 4n)]} is here</span>` : ''
  ].join('');
  const laneRows = isMine ? lanes(seed, mapSize, n).map(l => {
    const known = visited.includes(l.to);
    const dest = known ? esc(islandName(l.to)) : 'Unknown waters';
    const can = me!.charges >= l.cost && !busy;
    const btn = l.coop
      ? `<button data-act="coop-form" data-dir="${l.dir}" ${busy ? 'disabled' : ''}>Plan crew voyage</button>`
      : `<button class="go" data-act="sail" data-dir="${l.dir}" ${can ? '' : 'disabled'}>Set sail ⚓${l.cost}</button>`;
    const form = coopForm?.dir === l.dir ? coopFormMarkup(l.cost) : '';
    return `<li class="lane ${l.coop ? 'coop' : ''} ${focusLane === l.dir ? 'focus' : ''}" id="lane-${l.dir}"><span class="lane-cost ${l.coop ? 'crew' : l.cost === 2 ? 'two' : 'one'}"><i>${ICONS.anchor}</i>${l.cost}${l.coop ? '<small>crew</small>' : ''}</span>
      <span class="lane-dest">Lane ${l.dir + 1} → ${dest}${l.coop && !known ? `<small>Guaranteed ${GEMS[gemTypeOf(seed, l.to)]} for the first crew</small>` : ''}</span>${btn}${form}</li>`;
  }).join('') : '';
  const notes = island?.notes ?? [];
  const noteRows = notes.map((x, i) => `<li class="${selectedNote === i ? 'sel' : ''}" id="note-${i}" data-act="pick-note" data-i="${i}"><span class="note-meta">Pole #${i + 1} · ${Number(x.tile) === CENTER_TILE ? 'centre' : 'by the shore'} ${same(x.author, finder) ? '<b class="first">· First discoverer</b>' : ''} · ${name(x.author)} · ${new Date(Number(x.at) * 1000).toLocaleString()}</span>${esc(x.text)}</li>`).join('');
  const canNote = isMine && !notes.some(x => mine(x.author));
  const firstPole = notes.length === 0;
  const coins = me.coins;
  const buildReady = coins >= BigInt(NOTE_COST) && (firstPole || pickTile !== null) && !busy;
  const noteForm = canNote ? `<div class="note-form">
      <textarea id="note" maxlength="140" rows="2" placeholder="Write your note (public forever, no personal info)"></textarea>
      <p class="hint">${firstPole ? 'You are first here: your pole stands in the centre of the island, with a lantern on top.'
        : pickTile !== null ? 'Spot chosen. Build your pole there, or tap another glowing spot.'
        : 'The centre is taken. Choose a free spot on the island for your pole.'}</p>
      ${firstPole ? '' : `<button data-act="place">${placing ? 'Cancel choosing' : pickTile !== null ? 'Choose another spot' : 'Choose a spot on the island'}</button>`}
      <button class="primary" data-act="note" ${buildReady ? '' : 'disabled'}>Build note pole · ${COIN}${NOTE_COST}</button>
      ${coins < BigInt(NOTE_COST) ? `<p class="hint">You need ${NOTE_COST} coins. Sail to new islands to earn them.</p>` : ''}
    </div>` : '';
  return `<div class="card">
    <div class="island-head"><h2>${esc(islandName(n))}</h2><span class="muted">#${n}</span></div>
    ${inside !== n ? `<button class="go wide" data-act="enter">Go ashore</button>` : ''}
    <div class="badges">${badges}</div>
    ${isPartner ? `<p>Your Parley partner has been here.</p><button class="primary wide" data-act="jump" ${me.charges >= 1 && !busy ? '' : 'disabled'}>Jump here with Parley ⚓1</button>` : ''}
    ${isMine ? `<h3>Sea lanes <span class="muted">· the docks on the shore</span></h3><ul class="lanes">${laneRows}</ul>
      <p class="hint">Rewards are fixed by lane cost (⚓1: 10–20 coins, ⚓2: 25–40, crew: 60–100 + gem). Your daily streak sets where you land in the range. Claimed islands pay nothing.</p>` : ''}
    <h3>Note poles <span class="muted">${notes.length} on this island · tap a pole to read it</span></h3>
    ${notes.length ? `<ol class="notes">${noteRows}</ol>` : '<p class="muted">No poles yet. The first one stands in the centre.</p>'}
    ${noteForm}
  </div>`;
}

function coopFormMarkup(cost: number) {
  const active = partners.filter(p => p.until >= now());
  return `<div class="coop-form">
    <label>Crewmate address<input id="partner" list="partners" placeholder="0x…" value="${esc(sharedWith ?? '')}" autocomplete="off"></label>
    <datalist id="partners">${active.map(p => `<option value="${p.who}">`).join('')}</datalist>
    <label>Your charges<select id="mycharges">${[1, 2, 3].filter(c => cost - c <= 3 && cost - c >= 1).map(c => `<option value="${c}" ${c === 2 ? 'selected' : ''}>${c} (crewmate pays ${cost - c})</option>`).join('')}</select></label>
    <p class="hint">When your crewmate joins, you each get a 4×4 sliding puzzle. Both must solve it within ${coopWindow} seconds or the voyage is lost.</p>
    <button class="primary" data-act="propose">Send invitation</button>
  </div>`;
}

function shipPanel() {
  if (!me?.registered || !stats) return islandPanel();
  const fmt = (x: bigint, d: number) => (Number(x) / d).toFixed(2);
  const slots = SLOTS.map((s, i) => {
    const p = PARTS.find(x => x.id === equipped[i]);
    const shop = PARTS.filter(x => x.slot === i).map(x => `<li><span><b>${x.name}</b><small>${x.fx}</small></span>
      ${equipped[i] === x.id ? '<span class="badge">Installed</span>' : `<button data-act="buy" data-part="${x.id}" ${me!.coins >= BigInt(x.price) && !busy ? '' : 'disabled'}>${COIN}${x.price}</button>`}</li>`).join('');
    return `<details class="slot"><summary><span>${s}</span><b>${p ? p.name : 'Empty'}</b></summary><ul class="shop">${shop}</ul></details>`;
  }).join('');
  const dCost = 40 * (dmgLevel + 1), mCost = 60 * (multLevel + 1);
  return `<div class="card">
    <h2>Your ship</h2>
    <div class="statgrid">
      <div><span>Damage</span><b>${stats.damage}</b></div><div><span>Mult</span><b>×${fmt(stats.mult, 100)}</b></div>
      <div><span>Part ×</span><b>×${fmt(stats.xMult, 10000)}</b></div><div class="power"><span>Power</span><b>${stats.power}</b></div>
    </div>
    <p class="hint">Power = damage × mult × part multipliers. In a raid, a lead crew adds their damage and mults together and stacks both ships' × parts.</p>
    <div class="row"><button data-act="up-dmg" ${me.coins >= BigInt(dCost) && !busy ? '' : 'disabled'}>+5 damage<br>${COIN}${dCost}</button>
      <button data-act="up-mult" ${me.coins >= BigInt(mCost) && !busy ? '' : 'disabled'}>+0.10 mult<br>${COIN}${mCost}</button></div>
    <h3>Parts (buying replaces the old part)</h3>${slots}
  </div>`;
}

function crewPanel() {
  if (!signer || !me?.registered) return islandPanel();
  const active = partners.filter(p => p.until >= now());
  const vRows = voyages.map(v => {
    const amA = mine(v.a);
    const other = amA ? v.b : v.a;
    const deadline = Number(v.startedAt) + coopWindow;
    const solvedMe = amA ? v.aSolvedAt : v.bSolvedAt, solvedThem = amA ? v.bSolvedAt : v.aSolvedAt;
    let actions = '';
    if (v.status === 1 && !amA) actions = `<button class="go" data-act="join" data-id="${v.id}" ${!busy ? '' : 'disabled'}>Join (⚓${v.cost - v.aCharges})</button>`;
    if (v.status === 1) actions += `<button data-act="cancel" data-id="${v.id}">Cancel</button>`;
    if (v.status === 2 && deadline > now() && solvedMe === 0n) actions = `<button class="primary" data-act="open-puzzle" data-id="${v.id}">Open puzzle</button>`;
    if (v.status === 2 && deadline <= now()) actions = `<button data-act="expire" data-id="${v.id}">Mark lost</button>`;
    return `<li><span><b>${esc(islandName(v.from))} → ${v.status === 3 ? esc(islandName(v.to)) : 'unknown waters'}</b>
      <small>with ${short(other)} · ⚓${v.cost} · ${VOYAGE_STATUS[v.status]}${v.status === 2 ? ` · you ${solvedMe ? '✓' : '…'} / them ${solvedThem ? '✓' : '…'} · ${left(deadline - now())}` : ''}${v.status === 3 ? (v.fresh ? ' · claimed!' : ' · already claimed') : ''}</small></span>${actions}</li>`;
  }).join('');
  return `<div class="card">
    <h2>Parley</h2>
    <p>Meet another captain in person. One shows a code, the other scans it. For ${demo ? '10 minutes' : 'an hour'} your maps are shared and you can jump to any of their islands for ⚓1.</p>
    <div class="row"><button class="primary" data-act="show-qr">Show my code</button><button data-act="scan">Scan a code</button></div>
    <details><summary>No camera? Paste a code</summary><div class="note-form"><input id="paste" placeholder="lantern:parley:…"><button data-act="paste">Parley</button></div></details>
    ${active.length ? `<h3>Active Parleys</h3><ul class="list">${active.map(p => `<li><span><b>${short(p.who)}</b><small>${left(p.until - now())} left</small></span>
      <button data-act="share" data-who="${p.who}" ${same(sharedWith, p.who) ? 'disabled' : ''}>${same(sharedWith, p.who) ? 'Map shared' : 'Show their map'}</button></li>`).join('')}</ul>` : ''}
    <h3>Crew voyages</h3>
    ${voyages.length ? `<ul class="list">${vRows}</ul>` : '<p class="muted">Plan one from a ⚓4–5 crew lane on an island.</p>'}
    <p class="hint">Your address (share it with crewmates): <code class="copy" data-copy="${signer.address}">${signer.address}</code></p>
  </div>`;
}

function raidPanel() {
  if (!boss || !raidView) return '<div class="card"><p>Loading boss…</p></div>';
  const r = raidView, addr = signer?.address;
  const tier = Number((raidId - 1n) % 4n);
  const hp = r.status >= 2 ? r.hp : boss.maxHp;
  const pct = Number((hp * 100n) / boss.maxHp);
  const lead = addr && (same(r.leadA, addr) || same(r.leadB, addr));
  const timeLeft = Number(boss.endsAt) - now();
  let actions = '';
  if (signer && me?.registered) {
    if (r.status === 0 || (r.status === 1 && now() > Number(r.proposedAt) + 120)) {
      actions = `<div class="coop-form"><label>Lead with crewmate<input id="lead-partner" list="partners" placeholder="0x…" value="${esc(sharedWith ?? '')}"></label>
        <datalist id="partners">${partners.map(p => `<option value="${p.who}">`).join('')}</datalist>
        <button class="primary" data-act="lead">Propose to lead</button></div>`;
    } else if (r.status === 1) {
      actions = mine(r.leadB) ? '<button class="go wide" data-act="accept-lead">Accept and open the raid</button>'
        : `<p class="muted">Waiting for ${short(r.leadB)} to accept.</p>`;
    } else if (r.status === 2 && timeLeft > 0) {
      actions = `<button class="primary wide danger" data-act="attack" ${me.charges >= 1 && !busy ? '' : 'disabled'}>Sail & attack ⚓1 · ${lead ? `crew power ${crewPower}` : `power ${stats?.power ?? 0n}`}</button>`;
      if (lead) actions += `<div class="coop-form"><label>Add to the helpers' bounty (test USDC, max 100 per raid)<input id="bounty" type="number" min="1" max="100" value="10" inputmode="decimal"></label>
        <div class="row"><button data-act="fund">Escrow on C-Chain</button>${config.mode === 'local' ? '<button data-act="faucet">Get 100 test USDC</button>' : ''}</div>
        <p class="hint">Your wallet: ${usd(usdcBalance)} USDC. Helpers are paid by damage share only if the boss falls; the rest returns to you.</p></div>`;
    }
    if ((r.status === 3 || (r.status === 2 && timeLeft <= 0)) && !r.settled) actions += '<button class="primary wide" data-act="settle">Settle raid (sends the result over ICM)</button>';
  }
  return `<div class="card raid">
    <div class="island-head"><h2>☠ ${BOSSES[tier]}</h2><span class="muted">${boss.island !== null ? esc(islandName(boss.island)) : ''}</span></div>
    <div class="hp" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span><b>${hp} / ${boss.maxHp} HP</b></div>
    <p class="muted">${RAID_STATUS[r.status]}${r.settled ? ' · settled' : ''} · leaves in ${left(timeLeft)} · boss coins for the lead crew: ${COIN}${boss.coins}</p>
    ${r.status >= 1 ? `<p>Lead crew: <b>${name(r.leadA)}</b> + <b>${name(r.leadB)}</b> · bounty <b>${usd(r.bounty)} USDC</b> (escrowed on C-Chain)</p>` : ''}
    ${actions}
    ${helpers.length ? `<h3>Damage</h3><ul class="list">${helpers.map(h => `<li><span><b>${name(h.who)}</b><small>helper · ${r.totalDamage > 0n ? Number((h.dmg * 1000n) / r.totalDamage) / 10 : 0}% of damage</small></span><b>${h.dmg}</b></li>`).join('')}</ul>` : ''}
    ${myDamage > 0n ? `<p>Your damage: <b>${myDamage}</b></p>` : ''}
    ${lastRaid ? `<p>Last raid (${RAID_STATUS[lastRaid.view.status]}) is not settled.</p><button data-act="settle-last">Settle last raid</button>` : ''}
    ${claimable > 0n ? `<button class="primary wide" data-act="claim">Claim ${usd(claimable)} USDC on C-Chain</button>` : ''}
    <p class="hint">No sponsor pool and no yield: every USDC paid out was put in by that raid's lead crew. Coins never convert to money.</p>
  </div>`;
}

function cabinetPanel() {
  const addr = who();
  if (!addr || !me?.registered) return islandPanel();
  const link = `${location.origin}${location.pathname}?captain=${addr}`;
  return `<div class="card">
    <h2>Treasure cabinet</h2>
    <div class="statgrid">
      <div><span>Islands found</span><b>${me.islandsFound}</b></div><div><span>Voyages</span><b>${me.sails}</b></div>
      <div><span>Streak</span><b>${me.streak} day${me.streak === 1 ? '' : 's'}</b></div><div><span>Coins</span><b>${COIN}${me.coins}</b></div>
    </div>
    <h3>Gems</h3>
    <ul class="gems">${GEMS.map((g, i) => `<li class="gem-${i}"><i></i><span><b>${g}</b><small>${me!.gems[i]} owned · sells for ${COIN}${GEM_PRICE[i]}</small></span>
      ${signer && !viewAs ? `<button data-act="sell" data-gem="${i}" ${me!.gems[i] > 0n && !busy ? '' : 'disabled'}>Sell 1</button>` : ''}</li>`).join('')}</ul>
    <p class="hint">Gems come only from the first crew landing on a co-op island. They sell to the harbour for coins, never for money.</p>
    <h3>Share</h3><p><code class="copy" data-copy="${esc(link)}">${esc(link)}</code></p>
    <button data-act="copy-link" data-copy="${esc(link)}">Copy cabinet link</button>
  </div>`;
}

function helpPanel() {
  return `<div class="card">
    <h2>How Lantern Sea works</h2>
    <ul class="rules">
      <li><b>Charges:</b> 3 lanterns, refilling over 8 hours${demo ? ' (demo: one per minute)' : ''}. Each lane costs ⚓1 or ⚓2; crew lanes cost ⚓4–5, so two captains must pool charges.</li>
      <li><b>No luck:</b> islands and lanes come from a hash of the sea; rewards come only from lane cost, your streak and puzzle speed.</li>
      <li><b>Collisions:</b> the sea is small on purpose, so you will stumble onto other captains' islands and bases.</li>
      <li><b>Coins and gems</b> are free in-game points for ship parts and decoration. They cannot be bought or cashed out.</li>
      <li><b>Raids:</b> a co-op crew leads; they may escrow test USDC on C-Chain for helpers, paid by damage share over Avalanche ICM.</li>
    </ul>
    <h3>Network</h3>
    <p class="muted">Game: ${esc(config.game.name)} (#${config.game.chainId}) · Money: ${esc(config.vault.name)} (#${config.vault.chainId}) · ${config.mode === 'local' ? 'mock messenger (local)' : 'Teleporter / ICM'}</p>
    ${signer ? `<p>Signed in as <code class="copy" data-copy="${signer.address}">${signer.address}</code> (${signer.kind === 'guest' ? 'local guest' : 'wallet'})</p>
      <button data-act="disconnect">Disconnect</button>` : ''}
    ${txs.length ? `<h3>This session's transactions</h3><ul class="list">${txs.map(t => `<li><span>${esc(t.label)}</span>${t.network.explorerUrl ? `<a href="${esc(t.network.explorerUrl)}/tx/${t.hash}" target="_blank" rel="noreferrer">${short(t.hash)} ↗</a>` : `<code>${short(t.hash)}</code>`}</li>`).join('')}</ul>` : ''}
    <p class="hint">Test tokens only. Educational game; not financial advice or a financial service.</p>
  </div>`;
}

const qrExpiryText = (expiry: number) => `Valid for ${left(expiry - now())}. Let your crewmate scan it.`;

function overlayMarkup() {
  if (puzzle) {
    const t = puzzle.deadline - now();
    const solved = isSolved(puzzle.cells);
    return `<div class="overlay"><div class="modal puzzle">
      <div class="island-head"><h2>Crew voyage</h2><span class="timer ${t < 15 ? 'urgent' : ''}">${left(Math.max(0, t))}</span></div>
      <p class="muted">Slide the tiles into order 1–15. Your crewmate is solving theirs at the same time.</p>
      <div class="board">${puzzle.cells.map((v, i) => `<button class="tile ${v === 0 ? 'blank' : ''} ${v === i + 1 ? 'home' : ''}" data-cell="${i}" ${v === 0 || puzzle!.submitting ? 'disabled' : ''} aria-label="${v === 0 ? 'gap' : `tile ${v}`}">${v || ''}</button>`).join('')}</div>
      <p class="muted">${puzzle.moves.length} moves${solved ? ' · solved! sending…' : ''}</p>
      <div class="row"><button data-act="reset-puzzle" ${puzzle.submitting ? 'disabled' : ''}>Reset</button><button data-act="close-puzzle">Close</button></div>
    </div></div>`;
  }
  if (overlay === 'qr' && qr) {
    return `<div class="overlay"><div class="modal">
      <h2>Your Parley code</h2><img class="qr" src="${qr.url}" alt="Parley QR code">
      <p class="muted" id="qr-expiry">${qrExpiryText(qr.expiry)}</p>
      <details><summary>Copy as text</summary><code class="copy" data-copy="${esc(qr.code)}">${esc(qr.code.slice(0, 64))}…</code></details>
      <div class="row"><button data-act="show-qr">New code</button><button data-act="close-overlay">Close</button></div>
    </div></div>`;
  }
  if (overlay === 'scan') {
    return `<div class="overlay"><div class="modal"><h2>Scan a Parley code</h2>
      <video id="cam" playsinline muted></video><canvas id="camcanvas" hidden></canvas>
      <p class="muted" id="scanmsg">Point the camera at your crewmate's code.</p>
      <button data-act="close-overlay">Close</button></div></div>`;
  }
  return '';
}

// ------------------------------------------------------------------ render

function overlayStateKey() {
  if (puzzle) return `puzzle:${puzzle.id}:${puzzle.moves.length}:${puzzle.submitting}`;
  if (overlay === 'qr' && qr) return `qr:${qr.code}`;
  return overlay;
}

function render() {
  if (!config) return;
  const focused = document.activeElement as HTMLElement | null;
  const typing = focused && ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName) && !!focused.id
    && !!document.querySelector('#sheet')?.contains(focused) ? focused as HTMLInputElement : null;
  const hudHtml = hud();
  const panel = tab === 'island' ? islandPanel() : tab === 'ship' ? shipPanel() : tab === 'crew' ? crewPanel()
    : tab === 'raid' ? raidPanel() : tab === 'cabinet' ? cabinetPanel() : helpPanel();
  const sheetHtml = panel + (busy || notice) + String(noticeError) + String(sheetMin);
  const inIsland = inside !== null;
  const nextOverlayKey = overlayStateKey();
  const sheetUnchanged = !clearForms && !!document.querySelector('#sheet') && sheetHtml === renderedSheet
    && renderedTab === tab && renderedInside === inIsland;
  if (sheetUnchanged) {
    // Nothing in the panel/nav changed: refresh only the HUD (when changed) and overlay state so open DOM nodes stay attached.
    if (hudHtml !== renderedHud) {
      renderedHud = hudHtml;
      document.querySelector('.hud')!.outerHTML = hudHtml;
      bind(document.querySelector('.hud')!);
    }
    if (nextOverlayKey !== renderedOverlayKey) renderOverlay();
    return;
  }
  renderedHud = hudHtml;
  renderedSheet = sheetHtml;
  renderedInside = inIsland;
  // Something in the panel changed (coins arrived, a spot was picked...): redraw it, then put the cursor back.
  const caret = typing ? { id: typing.id, start: typing.selectionStart, end: typing.selectionEnd } : null;
  const scrollTop = renderedTab === tab ? document.querySelector('#sheet')?.scrollTop ?? 0 : 0;
  renderedTab = tab;
  const keptOverlay = document.querySelector<HTMLElement>('#overlay-root');
  // Keep what the captain typed and which sections are open across background refreshes.
  const values = new Map<string, string>();
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('#ui [id]').forEach(el => {
    if ('value' in el && el.value !== undefined && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) values.set(el.id, el.value);
  });
  const openDetails = new Set([...document.querySelectorAll<HTMLDetailsElement>('#ui details[open] > summary')].map(s => s.textContent ?? ''));
  const ui = document.querySelector('#ui')!;
  ui.innerHTML = `${hudHtml}
    <div class="demo-flag">${demo ? 'DEMO TIME: 1 charge/min · 10-min bosses · ' : ''}TEST TOKENS ONLY · ${config.mode === 'local' ? 'LOCAL CHAINS + MOCK ICM' : 'GAME L1 + FUJI VIA ICM'}</div>
    <section id="sheet" class="sheet ${sheetMin ? 'min' : ''}"><button class="grip" data-act="grip" aria-label="${sheetMin ? 'Expand panel' : 'Collapse panel'}">${sheetMin ? '▴' : '▾'}</button>${panel}
      <div class="notice ${noticeError ? 'error' : ''}" role="status" aria-live="polite">${esc(busy || notice)}</div></section>
    <nav class="tabs">${(['island', 'ship', 'crew', 'raid', 'cabinet', 'help'] as Tab[]).map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">
      <span class="ico">${ICONS[t]}</span>${t === 'island' ? 'Sea' : t === 'cabinet' ? 'Cabinet' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</nav>
    <div class="mapctl"><button data-act="zoom-in" aria-label="Zoom in">+</button><button data-act="zoom-out" aria-label="Zoom out">−</button>${inIsland ? '<button data-act="fit" aria-label="Fit island">⤢</button>' : ''}</div>
    ${inIsland ? '<button class="backsea primary" data-act="back-sea">⟵ Back to sea</button>' : ''}
    <div id="overlay-root"></div>`;
  // After a successful action the forms start clean; otherwise restore what was typed.
  if (!clearForms) for (const [id, v] of values) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && v !== '') el.value = v;
  }
  clearFormsApplied = clearForms;
  clearForms = false;
  document.querySelectorAll<HTMLDetailsElement>('#ui details').forEach(d => {
    if (openDetails.has(d.querySelector('summary')?.textContent ?? '')) d.open = true;
  });
  const sheet = document.querySelector('#sheet');
  if (sheet) sheet.scrollTop = scrollTop;
  if (caret && !clearFormsApplied) {
    const el = document.getElementById(caret.id) as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: true });
      try { if (caret.start !== null) el.setSelectionRange(caret.start, caret.end); } catch { /* not a text field */ }
    }
  }
  clearFormsApplied = false;
  updateInsets();
  for (const part of ui.querySelectorAll('.hud, #sheet, .tabs, .mapctl, .backsea')) bind(part);
  // Keep any active overlay DOM intact across background panel refreshes when its state is unchanged.
  const root = ui.querySelector<HTMLElement>('#overlay-root')!;
  const keep = keptOverlay && keptOverlay.dataset.key === nextOverlayKey && nextOverlayKey !== 'none';
  if (keep) root.replaceWith(keptOverlay!);
  else renderOverlay();
}

function renderOverlay() {
  const root = document.querySelector<HTMLElement>('#overlay-root');
  if (!root) return;
  const key = overlayStateKey();
  renderedOverlayKey = key;
  root.innerHTML = overlayMarkup();
  root.dataset.key = key;
  bind(root);
  if (overlay === 'scan' && !scanStop) void startScan();
}

function bind(root: Element) {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(el => el.addEventListener('click', () => { tab = el.dataset.tab as Tab; render(); }));
  root.querySelectorAll<HTMLElement>('[data-copy]').forEach(el => el.addEventListener('click', () => {
    void navigator.clipboard?.writeText(el.dataset.copy!).then(() => { notice = 'Copied.'; noticeError = false; render(); });
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach(el => el.addEventListener('click', () => tapTile(Number(el.dataset.cell))));
  const actionable = [...root.querySelectorAll<HTMLElement>('[data-act]')];
  if (root instanceof HTMLElement && root.dataset.act) actionable.push(root); // e.g. the floating "Back to sea" button
  actionable.forEach(el => el.addEventListener('click', () => onAction(el)));
}

const val = (id: string) => (document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '').trim();
function addressInput(id: string) {
  const v = val(id);
  if (!isAddress(v)) throw new Error('Enter your crewmate\'s 0x address (they can copy it from the Crew tab).');
  if (mine(v)) throw new Error('Pick a different captain.');
  return v as Address;
}

function onAction(el: HTMLElement) {
  const a = el.dataset.act!;
  const g = config.game, c = config.vault;
  switch (a) {
    case 'connect': tab = 'island'; sheetMin = false; render(); return;
    case 'grip': sheetMin = !sheetMin; render(); return;
    case 'guest': return void act('Preparing guest captain', () => connect('guest'));
    case 'injected': return void act('Connecting wallet', () => connect('injected'));
    case 'disconnect': signer = null; me = null; visited = []; selected = null; render(); return;
    case 'exit-view': viewAs = null; history.replaceState(null, '', location.pathname); me = null; render(); return;
    case 'register': return void act('Claiming your island', () => tx(g, config.sea, seaAbi, 'register', [], 'Claim home island'));
    case 'sail': return void act('Setting sail', async () => {
      const dir = Number(el.dataset.dir);
      const lane = lanes(seed, mapSize, selected!)[dir];
      const from = selected!;
      await tx(g, config.sea, seaAbi, 'sail', [from, dir], `Sail to ${visited.includes(lane.to) ? islandName(lane.to) : 'unknown waters'}`);
      await voyageTo(from, lane.to);
    });
    case 'coop-form': coopForm = coopForm?.dir === Number(el.dataset.dir) ? null : { dir: Number(el.dataset.dir) }; render(); return;
    case 'propose': return void act('Sending invitation', async () => {
      const partner = addressInput('partner');
      await tx(g, config.coop, coopAbi, 'propose', [partner, selected, coopForm!.dir, Number(val('mycharges'))], 'Invite crewmate');
      coopForm = null; tab = 'crew'; notice = 'Invitation sent. Your crewmate joins from their Crew tab; then the puzzle starts for both of you.';
    });
    case 'join': return void act('Joining voyage', () => tx(g, config.coop, coopAbi, 'join', [BigInt(el.dataset.id!)], 'Join crew voyage'));
    case 'cancel': return void act('Cancelling', () => tx(g, config.coop, coopAbi, 'cancel', [BigInt(el.dataset.id!)], 'Cancel voyage'));
    case 'expire': return void act('Closing voyage', () => tx(g, config.coop, coopAbi, 'expire', [BigInt(el.dataset.id!)], 'Mark voyage lost'));
    case 'open-puzzle': dismissedPuzzles.delete(el.dataset.id!); void refresh().then(render); return;
    case 'close-puzzle': if (puzzle) dismissedPuzzles.add(String(puzzle.id)); puzzle = null; render(); return;
    case 'reset-puzzle': return void act('Resetting puzzle', async () => {
      const board = await read<bigint>(g, config.coop, coopAbi, 'puzzleOf', [puzzle!.id, signer!.address]);
      puzzle = { ...puzzle!, cells: decodeBoard(board), moves: [] };
    }).then(renderOverlay);
    case 'note': return void act('Building your note pole', async () => {
      const text = val('note');
      if (!text) throw new Error('Write a short note first.');
      if (new TextEncoder().encode(text).length > 140) throw new Error('Notes are limited to 140 bytes.');
      const tile = (island?.notes.length ?? 0) === 0 ? CENTER_TILE : pickTile;
      if (tile === null) throw new Error('Choose a spot on the island first.');
      await tx(g, config.sea, seaAbi, 'leaveNote', [selected, text, tile], 'Build note pole');
      placing = false; pickTile = null;
    });
    case 'place':
      if (inside !== selected && selected !== null) enterIsland(selected);
      placing = !placing; pickTile = null; render(); updateMap(); return;
    case 'pick-note': selectedNote = Number(el.dataset.i); render(); updateMap(); return;
    case 'enter': if (selected !== null) enterIsland(selected); return;
    case 'back-sea': inside = null; placing = false; pickTile = null; selectedNote = null; map?.leaveIsland(); render(); return;
    case 'zoom-in': map?.zoomBy(1.25); return;
    case 'zoom-out': map?.zoomBy(0.8); return;
    case 'fit': map?.fitIsland(); return;
    case 'jump': return void act('Jumping', async () => {
      const to = selected!;
      const from = visited[visited.length - 1] ?? me!.home;
      await tx(g, config.sea, seaAbi, 'parleyJump', [sharedWith, to], 'Parley jump');
      await voyageTo(from, to);
    });
    case 'buy': return void act('Fitting part', () => tx(g, config.shipyard, yardAbi, 'buyPart', [Number(el.dataset.part)], `Install ${PARTS.find(p => p.id === Number(el.dataset.part))!.name}`));
    case 'up-dmg': return void act('Upgrading', () => tx(g, config.shipyard, yardAbi, 'upgrade', [true], 'Upgrade damage'));
    case 'up-mult': return void act('Upgrading', () => tx(g, config.shipyard, yardAbi, 'upgrade', [false], 'Upgrade mult'));
    case 'sell': return void act('Selling gem', () => tx(g, config.sea, seaAbi, 'sellGems', [Number(el.dataset.gem), 1n], `Sell ${GEMS[Number(el.dataset.gem)]}`));
    case 'show-qr': return void act('Signing Parley code', showQr);
    case 'scan': overlay = 'scan'; render(); return;
    case 'paste': return void act('Starting Parley', () => submitParley(val('paste')));
    case 'close-overlay': stopScan(); overlay = 'none'; qr = null; render(); return;
    case 'share': sharedWith = el.dataset.who as Address; void refresh().then(render); return;
    case 'lead': return void act('Proposing raid lead', () => tx(g, config.raid, raidAbi, 'proposeLead', [addressInput('lead-partner')], 'Propose raid lead'));
    case 'accept-lead': return void act('Opening raid', () => tx(g, config.raid, raidAbi, 'acceptLead', [raidId], 'Open raid (ICM → C-Chain)'));
    case 'attack': return void act('Attacking', () => tx(g, config.raid, raidAbi, 'attack', [raidId], 'Attack boss'));
    case 'settle': return void act('Settling', () => tx(g, config.raid, raidAbi, 'settle', [raidId], 'Settle raid (ICM → C-Chain)'));
    case 'settle-last': return void act('Settling', () => tx(g, config.raid, raidAbi, 'settle', [lastRaid!.id], 'Settle last raid'));
    case 'faucet': return void act('Getting test USDC', () => tx(c, config.usdc, usdcAbi, 'faucet', [], 'Test USDC faucet'));
    case 'fund': return void act('Escrowing bounty', async () => {
      const amount = parseUnits(val('bounty') || '0', 6);
      if (amount <= 0n || amount > 100_000000n) throw new Error('Bounty must be between 1 and 100 test USDC.');
      await tx(c, config.usdc, usdcAbi, 'approve', [config.escrow, amount], 'Approve exact bounty');
      await tx(c, config.escrow, escrowAbi, 'fund', [raidId, amount], 'Escrow bounty (ICM → L1)');
    });
    case 'claim': return void act('Claiming', () => tx(c, config.escrow, escrowAbi, 'claim', [], 'Claim USDC'));
    case 'copy-link': return;
  }
}

// ------------------------------------------------------------------ puzzle

function tapTile(cell: number) {
  if (!puzzle || puzzle.submitting) return;
  const move = moveForTap(puzzle.cells, cell);
  if (move < 0) return;
  puzzle.cells = moveBlank(puzzle.cells, move)!;
  puzzle.moves.push(move);
  if (isSolved(puzzle.cells)) {
    puzzle.submitting = true;
    const p = puzzle;
    void act('Sending your solution', async () => {
      try {
        await tx(config.game, config.coop, coopAbi, 'solve', [p.id, toHex(Uint8Array.from(p.moves))], 'Submit puzzle solution');
        notice = 'Solved! Waiting for your crewmate…';
        dismissedPuzzles.add(String(p.id));
        puzzle = null;
      } finally { if (puzzle) puzzle.submitting = false; }
    });
    renderOverlay();
    return;
  }
  renderOverlay();
}

// ------------------------------------------------------------------ parley

async function showQr() {
  if (!signer) throw new Error('Connect first.');
  const block = await pub(config.game).getBlock();
  const expiry = block.timestamp + 110n;
  const digest = await read<Hex>(config.game, config.sea, seaAbi, 'parleyDigest', [signer.address, expiry]);
  const sig = await signer.signDigest(digest);
  const code = `lantern:parley:${signer.address}:${expiry}:${sig}`;
  qr = { code, url: await QRCode.toDataURL(code, { margin: 1, width: 280, errorCorrectionLevel: 'M' }), expiry: Number(expiry) };
  overlay = 'qr';
  notice = 'Show this code to your crewmate.';
}

async function submitParley(code: string) {
  const m = /^lantern:parley:(0x[0-9a-fA-F]{40}):(\d+):(0x[0-9a-fA-F]{130})$/.exec(code.trim());
  if (!m) throw new Error('That is not a Lantern Sea Parley code.');
  await tx(config.game, config.sea, seaAbi, 'parley', [m[1], BigInt(m[2]), m[3]], `Parley with ${short(m[1])}`);
  sharedWith = m[1] as Address;
  notice = 'Parley started! Your maps are shared.';
}

function stopScan() { scanStop?.(); scanStop = null; }
async function startScan() {
  const video = document.querySelector<HTMLVideoElement>('#cam');
  const canvas = document.querySelector<HTMLCanvasElement>('#camcanvas');
  const msg = document.querySelector('#scanmsg');
  if (!video || !canvas) return;
  if (!navigator.mediaDevices?.getUserMedia) { if (msg) msg.textContent = 'Camera needs HTTPS (or localhost). Paste the code instead.'; return; }
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch { if (msg) msg.textContent = 'Camera blocked. Allow it, or paste the code instead.'; return; }
  let running = true;
  scanStop = () => { running = false; stream.getTracks().forEach(t => t.stop()); };
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const tick = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (found?.data.startsWith('lantern:parley:')) {
        stopScan(); overlay = 'none';
        void act('Starting Parley', () => submitParley(found.data));
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ boot

async function boot() {
  const response = await fetch('./config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No config yet. Run `npm run local`, or `npm run config:testnet` (see README).');
  config = await response.json();
  const required = [config.sea, config.coop, config.shipyard, config.raid, config.escrow, config.usdc];
  if (!required.every(x => isAddress(x))) throw new Error('Contract config is incomplete.');
  [seed, mapSize, demo, coopWindow] = await Promise.all([
    read<Hex>(config.game, config.sea, seaAbi, 'worldSeed'),
    read<number>(config.game, config.sea, seaAbi, 'mapSize').then(Number),
    read<boolean>(config.game, config.sea, seaAbi, 'demoMode'),
    read<bigint>(config.game, config.coop, coopAbi, 'window').then(Number)]);
  const view = new URLSearchParams(location.search).get('captain');
  if (view && isAddress(view)) { viewAs = view; tab = 'cabinet'; }
  app.innerHTML = '<div id="sea" class="sea" aria-label="Sea map"></div><div id="ui" class="ui"></div>';
  map = new SeaMap(document.querySelector('#sea')!, n => enterIsland(n), {
    onTile: t => { pickTile = t; placing = false; tab = 'island'; sheetMin = false; render(); updateMap(); },
    onPole: i => {
      selectedNote = i; tab = 'island'; sheetMin = false; render(); updateMap();
      document.querySelector(`#note-${i}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    onDock: dir => {
      focusLane = dir; tab = 'island'; sheetMin = false; render();
      document.querySelector(`#lane-${dir}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  if (config.mode === 'local') {
    (window as unknown as { __lantern: unknown }).__lantern = { map }; // local debugging and tests only
    try { if (sessionStorage.getItem('lantern-guest-key')) await connect('guest'); } catch { /* storage blocked */ }
  } else if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as Address[];
      if (accounts[0]) signer = await injectedSigner();
    } catch { /* connect on demand */ }
  }
  window.ethereum?.on?.('accountsChanged', () => { if (signer?.kind === 'injected') { signer = null; me = null; visited = []; render(); } });
  render(); await refresh(); render();
  setInterval(() => { void refresh().then(render); }, 3000);
  setInterval(() => {
    if (puzzle) {
      const t = puzzle.deadline - now();
      const el = document.querySelector('.timer');
      if (el) { el.textContent = left(Math.max(0, t)); el.classList.toggle('urgent', t < 15); }
    } else if (overlay === 'qr' && qr) {
      const el = document.querySelector('#qr-expiry');
      if (el) el.textContent = qrExpiryText(qr.expiry);
    }
  }, 1000);
}

void boot().catch(error => {
  app.innerHTML = `<div class="setup"><h1>Lantern Sea</h1><p>${esc((error as Error).message)}</p><pre>npm ci\nnpm run local</pre></div>`;
});
