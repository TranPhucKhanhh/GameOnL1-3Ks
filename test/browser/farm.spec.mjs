import { test, expect } from '@playwright/test';

test('desktop/mobile and full browser farm cycle using local unlocked test wallet', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let chainId = '0x7a69'; // 31337, game Anvil; 31338 is vault Anvil.
    let connected = false;
    const address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    window.ethereum = {
      async request({ method, params = [] }) {
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_chainId') return chainId;
        if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; return null; }
        if (method === 'wallet_addEthereumChain') return null;
        const url = chainId === '0x7a69' ? 'http://127.0.0.1:8545' : 'http://127.0.0.1:9545';
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
        const result = await response.json();
        if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
        return result.result;
      }, on() {}
    };
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Gieo hôm nay/ })).toBeVisible();
  await expect(page.locator('.plot')).toHaveCount(6);
  await expect(page.getByRole('button', { name: /Trồng hạt giống/ }).first()).toBeDisabled();
  await page.screenshot({ path: 'test-results/farm-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/farm-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: /Kết nối ví/ }).click();
  await page.getByRole('button', { name: /1. Nhận 1.000/ }).click();
  await expect(page.locator('.stats > div').nth(0)).toContainText('1,000');
  await page.getByRole('button', { name: /2. Nạp 100/ }).click();
  await expect(page.locator('.stats > div').nth(1)).toContainText('100');
  const plot = page.locator('article[data-slot="0"]');
  await plot.getByRole('button', { name: /Trồng hạt giống/ }).click();
  await expect(plot.locator('.tag')).toHaveText('Đang lớn');
  await expect(plot.getByRole('button', { name: 'Thu hoạch' })).toBeDisabled();
  await plot.getByRole('button', { name: 'Nhổ cây' }).click();
  await expect(plot.locator('.tag')).toHaveText('Sẵn sàng');
  await expect(page.locator('.stats > div').nth(1)).toContainText('100');
  await plot.getByRole('button', { name: /Trồng hạt giống/ }).click();
  await expect(plot.locator('.tag')).toHaveText('Đang lớn');
  async function rpc(method, params = []) {
    const response = await request.post('http://127.0.0.1:9545', { data: { jsonrpc: '2.0', id: 1, method, params } });
    expect((await response.json()).error).toBeUndefined();
  }
  await rpc('evm_increaseTime', [61]);
  await rpc('evm_mine');
  await expect(plot.getByRole('button', { name: 'Thu hoạch' })).toBeEnabled();
  await plot.getByRole('button', { name: 'Thu hoạch' }).click();
  await expect(plot.locator('.tag')).toHaveText('Sẵn sàng');
  await expect(page.locator('.stats > div').nth(1)).toContainText('101');
  await expect(page.locator('.stats > div').nth(3)).toContainText('01');
  await page.getByRole('button', { name: /Rút toàn bộ/ }).click();
  await expect(page.locator('.stats > div').nth(0)).toContainText('1,001');
  expect(errors).toEqual([]);
});
