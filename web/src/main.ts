import { createPublicClient, createWalletClient, custom, defineChain, formatUnits, http, isAddress, parseUnits, type Address, type EIP1193Provider } from 'viem';
import farmABI from './generated/Farm.json';
import vaultABI from './generated/TierVault.json';
import tokenABI from './generated/DemoUSD.json';
import './style.css';

type Network = { chainId: number; name: string; symbol: string; rpcUrl: string; blockchainId: string; messenger: Address; explorerUrl?: string };
type Config = { mode: 'local' | 'fuji-icm'; game: Network; vault: Network; farm: Address; tierVault: Address; token: Address };
type Plot = { status: number; tier: number; requestId: bigint; plantedAt: bigint; unlockAt: bigint; principal: bigint; reward: bigint };
type Injected = EIP1193Provider & { on?: (event: string, cb: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Injected } }

const app = document.querySelector<HTMLDivElement>('#app')!;
const tiers = [
  { name: 'Vườn rau', crop: 'Cà rốt', bps: 100, description: 'Bắt đầu từ một hạt giống nhỏ.', term: '7 ngày', demo: '60 giây' },
  { name: 'Ruộng lúa', crop: 'Lúa vàng', bps: 300, description: 'Kiên nhẫn thêm một chút.', term: '30 ngày', demo: '120 giây' },
  { name: 'Vườn cây', crop: 'Táo đỏ', bps: 800, description: 'Chăm hôm nay, hái ngày mai.', term: '90 ngày', demo: '180 giây' }
];
let config: Config;
let account: Address | undefined;
let plots: Plot[] = [];
let walletBalance = 0n, credits = 0n, principal = 0n, rewardBudget = 0n, harvests = 0n;
let tier = 0, amount = '100', demoMode = true, busy = '', notice = '', noticeError = false;
let timestamp = BigInt(Math.floor(Date.now() / 1000));
let lastRead = 0, refreshBusy = false;
const transactions: { hash: string; label: string; network: Network }[] = [];
const emptyPlot = (): Plot => ({ status: 0, tier: 0, requestId: 0n, plantedAt: 0n, unlockAt: 0n, principal: 0n, reward: 0n });
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const money = (n: bigint) => Number(formatUnits(n, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const disabled = () => busy || !account ? 'disabled' : '';

function chain(network: Network) {
  return defineChain({ id: network.chainId, name: network.name,
    nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
    rpcUrls: { default: { http: [network.rpcUrl] } } });
}
const client = (network: Network) => createPublicClient({ chain: chain(network), transport: http(network.rpcUrl) });
async function read(network: Network, address: Address, abi: typeof farmABI, functionName: string, args: unknown[] = []) {
  return client(network).readContract({ address, abi, functionName, args });
}

function sprout(crop: number, grown = true) {
  const color = ['#e68b42', '#e4bc56', '#d66c55'][crop];
  return `<svg class="crop" viewBox="0 0 64 72" role="img" aria-label="${tiers[crop].crop}" shape-rendering="crispEdges">
    <ellipse cx="32" cy="65" rx="24" ry="5" fill="#4b3128" opacity=".18"/>
    <path d="M29 62V30h6v32z" fill="#4f7840"/>
    <path d="M29 44H17V32h12v6h6V26h14v13H35v11h-6z" fill="#6c994d"/>
    ${grown ? crop === 0 ? `<path d="M21 43h24v13H37v12h-9V56h-7z" fill="${color}"/><path d="M25 48h9v4h-9z" fill="#f8b86f"/>`
      : crop === 1 ? `<path d="M22 15h7v10h-7zm13-6h7v12h-7zm-13 22h7v8h-7zm13-7h7v11h-7zm0 18h7v8h-7z" fill="${color}"/>`
      : `<path d="M17 13h30v9h9v22h-9v8H17v-8H9V22h8z" fill="#6c914c"/><path d="M17 25h9v9h-9zm20-9h9v9h-9zm1 23h9v9h-9z" fill="${color}"/>` : ''}
  </svg>`;
}

function plotMarkup(p: Plot, slot: number) {
  const growing = p.status === 2;
  const mature = growing && timestamp >= p.unlockAt;
  const pending = p.status === 1 || p.status === 3 || p.status === 4;
  const progress = growing ? Math.max(0, Math.min(100, Number((timestamp - p.plantedAt) * 100n / (p.unlockAt - p.plantedAt)))) : 0;
  const seconds = Math.max(0, Number(p.unlockAt - timestamp));
  const remaining = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.ceil(seconds / 60)} phút` : `${Math.ceil(seconds / 86400)} ngày`;
  return `<article class="plot ${p.status === 0 ? 'empty' : ''} ${mature ? 'mature' : ''}" data-slot="${slot}">
    <div class="plot-top"><span>Ô đất ${String(slot + 1).padStart(2, '0')}</span><span class="tag ${mature ? 'ready' : ''}">${pending ? 'Đang gửi ICM' : mature ? 'Đã chín' : growing ? 'Đang lớn' : 'Sẵn sàng'}</span></div>
    <div class="soil">${p.status === 0 ? '<span class="plant-plus">+</span>' : sprout(p.tier, mature || progress > 40)}<i></i><i></i><i></i></div>
    <div class="plot-name">${p.status === 0 ? 'Một khởi đầu mới' : tiers[p.tier].crop}</div>
    <div class="plot-detail">${p.status === 0 ? 'Gieo hạt để bắt đầu mùa vụ' : pending ? 'Chờ xác nhận từ chuỗi bên kia…' : `${money(p.principal)} dUSD · ${mature ? 'Có thể thu hoạch' : remaining + ' còn lại'}`}</div>
    <div class="progress" role="progressbar" aria-label="Tiến độ ô ${slot + 1}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
    <div class="plot-actions">${p.status === 0
      ? `<button class="plant" data-action="plant" data-slot="${slot}" ${disabled()}>＋ Trồng hạt giống</button>`
      : `<button class="harvest" data-action="harvest" data-slot="${slot}" ${disabled() || (!mature ? 'disabled' : '')}>Thu hoạch</button><button class="uproot" data-action="uproot" data-slot="${slot}" ${disabled() || (!growing ? 'disabled' : '')} title="Hoàn toàn bộ gốc, bỏ phần thưởng">Nhổ cây</button>`}</div>
  </article>`;
}

function render() {
  if (!config) return;
  app.innerHTML = `<div class="shell">
    <aside class="sidebar"><a class="brand" href="/" aria-label="DeFi Farm"><span class="brand-icon">↟</span>defi<span>farm</span><small>AVALANCHE / UNIHACK 2026</small></a>
      <div class="side-label">KHU VƯỜN CỦA BẠN</div><a class="nav active" href="#farm"><span>▦</span> Nông trại <b>06</b></a>
      <a class="nav" href="#how"><span>↗</span> Cách chơi</a><a class="nav" href="https://team1vn.xyz/topic.html#11" target="_blank" rel="noreferrer"><span>◇</span> Đề tài cuộc thi ↗</a>
      <div class="side-bottom"><div class="chain-node"><i></i>Game L1 <small>#${config.game.chainId}</small></div><div class="chain-line">↕ ${config.mode === 'local' ? 'MOCK MESSENGER' : 'TELEPORTER / ICM'}</div><div class="chain-node"><i></i>${config.mode === 'local' ? 'Vault chain' : 'Fuji C-Chain'} <small>#${config.vault.chainId}</small></div><p>Game ở một chuỗi.<br>Số dư ở một chuỗi.<br>Bạn giữ quyền rút tiền.</p></div>
    </aside>
    <main id="farm"><header class="topbar"><span class="breadcrumb">Nông trại <span>/</span> Mùa vụ của tôi</span><button id="connect" class="wallet">${account ? '● ' + short(account) : 'Kết nối ví ↗'}</button></header>
      <div class="content"><div class="demo-banner"><span>◈ ${config.mode === 'local' ? 'LOCAL DEMO · MESSENGER GIẢ LẬP' : 'FUJI + GAME L1 · TELEPORTER'}</span><span>${demoMode ? 'Thời gian rút ngắn 60 / 120 / 180 giây.' : 'Kỳ hạn 7 / 30 / 90 ngày.'} Phần thưởng mô phỏng, dUSD không có giá trị tiền.</span></div>
      <section class="hero"><div><div class="eyebrow">A LITTLE PATIENCE. A LITTLE GROWTH.</div><h1>Gieo hôm nay.<br><em>Gặt ngày mai.</em></h1><p>Biến những khái niệm DeFi thành một khu vườn.<br>Trồng, chờ và thu hoạch — từng mùa vụ một.</p><a href="#how" class="text-link">Khám phá cách nông trại vận hành <span>↗</span></a></div><div class="hero-art" aria-hidden="true"><span class="sun"></span><div class="floating-label">GROW AT YOUR OWN PACE <span>✦</span></div><div class="garden">${sprout(2)}${sprout(1)}${sprout(0)}</div><span class="hero-caption">a small farm, on a big network.</span></div></section>
      <section class="stats" aria-label="Số dư"><div><span>TRONG VÍ · dUSD</span><strong>${money(walletBalance)}<small>dUSD</small></strong></div><div><span>CÓ THỂ RÚT · VAULT</span><strong>${money(credits)}<small>dUSD</small></strong></div><div><span>ĐANG GIEO TRỒNG</span><strong>${money(principal)}<small>dUSD</small></strong></div><div><span>MÙA VỤ ĐÃ THU</span><strong>${harvests.toString().padStart(2, '0')}<small>mùa</small></strong></div></section>
      <section class="workspace"><div class="fields"><div class="section-title"><h2>Những mảnh vườn nhỏ <span>06 ô đất</span></h2><span class="live">${lastRead ? '● Đã đồng bộ' : '○ Đang kết nối'}</span></div><div class="plots">${Array.from({ length: 6 }, (_, i) => plotMarkup(plots[i] ?? emptyPlot(), i)).join('')}</div></div>
      <aside class="controls"><div class="eyebrow">CHUẨN BỊ MÙA VỤ</div><h2>Chọn hạt giống</h2><p>Mỗi loại cây, một khoảng chờ.</p><div class="seeds">${tiers.map((t, i) => `<button class="seed ${tier === i ? 'selected' : ''}" data-tier="${i}" aria-pressed="${tier === i}">${sprout(i)}<span><b>${t.name}</b><small>${demoMode ? t.demo : t.term} · +${t.bps / 100}% / vụ</small></span><i>${tier === i ? '●' : '○'}</i></button>`).join('')}</div>
      <label for="amount">Số dUSD cho mỗi lượt trồng</label><div class="amount-field"><input id="amount" type="number" min="1" max="1000" step="1" value="${esc(amount)}" inputmode="decimal" /><span>dUSD</span></div><p class="hint">1–1.000 dUSD / ô. Thu hoạch nhận lại gốc và thưởng. Nhổ cây hoàn gốc, bỏ thưởng.</p>
      <div class="fund-actions"><button id="faucet" ${disabled()}>1. Nhận 1.000 dUSD test</button><button id="deposit" ${disabled()}>2. Nạp ${esc(amount)} dUSD vào vault</button><button id="withdraw" class="withdraw" ${disabled() || (credits === 0n ? 'disabled' : '')}>Rút toàn bộ số dư có thể rút ↗</button></div><div class="budget">Quỹ thưởng còn lại <b>${money(rewardBudget)} dUSD</b></div><p class="hint">Cần gas ở cả hai chuỗi. Kết nối MetaMask hoặc Core để chơi. Không gửi tiền thật.</p></aside></section>
      <div id="notice" class="notice ${noticeError ? 'error' : ''}" role="status" aria-live="polite">${esc(busy || notice || (account ? 'Chọn hạt giống, nạp dUSD và trồng ở một ô đất trống.' : 'Kết nối ví để bắt đầu. Bạn đang xem nông trại ở chế độ đọc.'))}</div>
      <section id="how" class="how"><div><span class="eyebrow">HOW YOUR GARDEN GROWS</span><h2>Một mùa vụ. Hai chuỗi.</h2></div><ol><li><b>01 / Chuẩn bị</b><p>Nhận dUSD test, cho phép vault và nạp số dư trên chuỗi vault.</p></li><li><b>02 / Gieo trồng</b><p>Trồng trên Game L1. Chờ yêu cầu và xác nhận quay về qua messenger.</p></li><li><b>03 / Thu hoạch</b><p>Đến hạn, nhận gốc + thưởng vào số dư vault. Rút về ví khi muốn.</p></li></ol></section>
      ${transactions.length ? `<section class="transactions"><h2>Giao dịch phiên này</h2>${transactions.map(tx => `<div><span>${esc(tx.label)}</span>${tx.network.explorerUrl ? `<a href="${esc(tx.network.explorerUrl)}/tx/${tx.hash}" target="_blank" rel="noreferrer">${short(tx.hash)} ↗</a>` : `<code>${short(tx.hash)}</code>`}</div>`).join('')}</section>` : ''}
      <footer><span>DEFI FARM <i>✦</i> Built to learn. Grown on Avalanche.</span><span>Team1 Vietnam UniHack · Baseline v0.1</span></footer>
      </div></main></div>`;
  document.querySelector('#connect')?.addEventListener('click', () => action(connect));
  document.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach(el => el.addEventListener('click', () => { tier = Number(el.dataset.tier); render(); }));
  document.querySelector<HTMLInputElement>('#amount')?.addEventListener('change', event => { amount = (event.target as HTMLInputElement).value; render(); });
  document.querySelector('#faucet')?.addEventListener('click', () => action(async () => { await transact(config.vault, config.token, tokenABI, 'faucet', [], 'Nhận dUSD test'); }));
  document.querySelector('#deposit')?.addEventListener('click', () => action(async () => {
    const value = inputAmount();
    await transact(config.vault, config.token, tokenABI, 'approve', [config.tierVault, value], 'Cho phép nạp đúng số dUSD');
    await transact(config.vault, config.tierVault, vaultABI, 'deposit', [value], 'Nạp số dư vault');
  }));
  document.querySelector('#withdraw')?.addEventListener('click', () => action(async () => { await transact(config.vault, config.tierVault, vaultABI, 'withdraw', [credits], 'Rút số dư về ví'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(el => el.addEventListener('click', () => action(async () => {
    const name = el.dataset.action!;
    const args = name === 'plant' ? [Number(el.dataset.slot), tier, inputAmount()] : [Number(el.dataset.slot)];
    await transact(config.game, config.farm, farmABI, name, args, name === 'plant' ? 'Gửi yêu cầu trồng' : name === 'harvest' ? 'Gửi yêu cầu thu hoạch' : 'Gửi yêu cầu nhổ cây');
    notice = 'Đã gửi yêu cầu. Ô đất chờ xác nhận từ vault qua messenger. Nếu bị từ chối, ô sẽ trở về trạng thái trước đó.';
  })));
}

function inputAmount() {
  const value = parseUnits(amount, 6);
  if (value < 1_000000n || value > 1000_000000n) throw new Error('Nhập từ 1 đến 1.000 dUSD.');
  return value;
}
async function connect() {
  if (!window.ethereum) throw new Error('Cài extension MetaMask hoặc Core, tạo ví test riêng rồi tải lại trang.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as Address[];
  account = accounts[0];
  if (!account) throw new Error('Ví chưa cấp quyền xem tài khoản.');
  notice = 'Đã kết nối ví. Nhận dUSD test và nạp vault để bắt đầu.';
}
async function switchNetwork(network: Network) {
  const provider = window.ethereum!;
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}` }] }); }
  catch (error) {
    const code = (error as { code?: number; data?: { originalError?: { code?: number } } });
    if (code.code !== 4902 && code.data?.originalError?.code !== 4902) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}`,
      chainName: network.name, nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
      rpcUrls: [network.rpcUrl], ...(network.explorerUrl ? { blockExplorerUrls: [network.explorerUrl] } : {}) }] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${network.chainId.toString(16)}` }] });
  }
}
async function transact(network: Network, address: Address, abi: typeof farmABI, functionName: string, args: unknown[], label: string) {
  busy = `${label} · xác nhận trong ví…`; render();
  await switchNetwork(network);
  const selected = await window.ethereum!.request({ method: 'eth_accounts' }) as Address[];
  if (!account || selected[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Tài khoản ví đã đổi. Kết nối lại trước khi gửi.');
  const publicClient = client(network);
  const wallet = createWalletClient({ account, chain: chain(network), transport: custom(window.ethereum!) });
  const { request } = await publicClient.simulateContract({ account, address, abi, functionName, args });
  const hash = await wallet.writeContract(request);
  transactions.unshift({ hash, label, network });
  transactions.splice(8);
  busy = `${label} · chờ giao dịch ${short(hash)}…`; render();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Giao dịch đã revert. Kiểm tra số dư và trạng thái ô đất.');
  notice = `${label}: thành công.`;
}
async function action(fn: () => Promise<void>) {
  if (busy) return;
  busy = 'Đang xử lý…'; noticeError = false; render();
  try { await fn(); }
  catch (error) {
    const e = error as { shortMessage?: string; message?: string };
    notice = (e.shortMessage || e.message || 'Thao tác thất bại.').slice(0, 360);
    if (notice.includes('FAUCET_COOLDOWN')) notice = 'Faucet giới hạn 1 lần / giờ cho mỗi địa chỉ.';
    noticeError = true;
  } finally { busy = ''; await refresh(); render(); }
}
async function refresh() {
  if (!config || refreshBusy) return;
  refreshBusy = true;
  try {
    const [budget, mode, block] = await Promise.all([
      read(config.vault, config.tierVault, vaultABI, 'availableRewards'),
      read(config.vault, config.tierVault, vaultABI, 'demoMode'), client(config.vault).getBlock()]);
    rewardBudget = budget as bigint; demoMode = mode as boolean;
    timestamp = block.timestamp > BigInt(Math.floor(Date.now() / 1000)) ? block.timestamp : BigInt(Math.floor(Date.now() / 1000));
    if (account) {
      const address = account;
      const values = await Promise.all([
        read(config.vault, config.token, tokenABI, 'balanceOf', [address]),
        read(config.vault, config.tierVault, vaultABI, 'credits', [address]),
        read(config.game, config.farm, farmABI, 'harvestCount', [address]),
        ...Array.from({ length: 6 }, (_, i) => read(config.game, config.farm, farmABI, 'getPlot', [address, i]))
      ]);
      if (account === address) {
        [walletBalance, credits, harvests] = values.slice(0, 3) as bigint[];
        plots = values.slice(3) as Plot[];
        principal = plots.reduce((sum, p) => sum + p.principal, 0n);
      }
    }
    lastRead = Date.now();
  } catch (error) {
    notice = `Không đọc được RPC/contract. Kiểm tra npm run local hoặc config testnet. ${(error as Error).message.slice(0, 120)}`;
    noticeError = true;
  } finally { refreshBusy = false; }
}

async function boot() {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Chưa có cấu hình. Chạy npm run local, hoặc npm run config:testnet theo README.');
  config = await response.json();
  if (!['local', 'fuji-icm'].includes(config.mode) || ![config.farm, config.tierVault, config.token].every(address => isAddress(address))) throw new Error('Cấu hình contract không hợp lệ.');
  if (window.ethereum) {
    try { account = (await window.ethereum.request({ method: 'eth_accounts' }) as Address[])[0]; } catch { /* connect on demand */ }
    window.ethereum.on?.('accountsChanged', (...args) => {
      account = (args[0] as Address[])[0]; plots = []; walletBalance = credits = principal = harvests = 0n;
      void refresh().then(render);
    });
  }
  render(); await refresh(); render();
  setInterval(() => {
    // Do not replace a focused input or wallet operation during background refresh.
    void refresh().then(() => { if (!busy && document.activeElement?.tagName !== 'INPUT') render(); });
  }, 3000);
}
void boot().catch(error => {
  app.innerHTML = `<div class="setup"><div class="eyebrow">DEFI FARM / SETUP</div><h1>Sẵn sàng gieo hạt?</h1><p>${esc((error as Error).message)}</p><pre>npm ci\nnpm run foundry:install\nnpm run local</pre><p>Mở README tại thư mục dự án để xem hướng dẫn Windows và Fuji + Game L1.</p></div>`;
});
