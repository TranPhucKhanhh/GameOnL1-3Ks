import { test, expect } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { act, gameClient, giveCoins, guestKey, loadAbi, loadConfig, tab, withCaptains } from './helpers.mjs';

test('three captains fund, attack and settle a raid and view the desktop cabinet', async ({ browser }) => {
  const cfg = loadConfig();
  const game = gameClient(cfg);
  const vault = createPublicClient({ transport: http(cfg.vault.rpcUrl) });
  const raidAbi = loadAbi('BossRaid');
  const escrowAbi = loadAbi('RaidEscrow');
  const keys = ['lantern-ui-raid-a', 'lantern-ui-raid-b', 'lantern-ui-raid-helper'].map(guestKey);
  await withCaptains(browser, keys, async ([lead, partner, helper]) => {
    async function advanceTo(timestamp) {
      await game.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
      await game.request({ method: 'evm_mine', params: [] });
      for (const captain of [lead, partner, helper]) {
        await captain.page.clock.setFixedTime(new Date(Number(timestamp) * 1000));
      }
    }

    // Headroom for the sequence even if the suite starts at the end of an epoch.
    const epoch = /** @type {bigint} */ (await game.readContract({ address: cfg.raid, abi: raidAbi, functionName: 'bossEpoch' }));
    const timestamp = /** @type {bigint} */ ((await game.getBlock()).timestamp);
    let endsAt = (timestamp / epoch + 1n) * epoch;
    if (endsAt - timestamp < 120n) {
      await advanceTo(endsAt + 1n);
      endsAt += epoch;
    }

    await giveCoins(cfg, lead.address, 90);
    await tab(lead.page, 'Ship');
    await lead.page.locator('#sheet button[data-act="up-dmg"]').click();
    await expect(lead.page.locator('#sheet .power b')).toHaveText('15');
    await lead.page.locator('#sheet details', { hasText: 'Jolly Flag' }).locator('summary').click();
    await lead.page.locator('#sheet button[data-part="13"]').click();
    await expect(lead.page.locator('#sheet .power b')).toHaveText('25');
    await lead.page.screenshot({ path: 'test-results/lantern-phone-ship.png' });

    await tab(lead.page, 'Raid');
    await lead.page.fill('#lead-partner', partner.address);
    await act(lead.page, 'Propose to lead');

    await tab(partner.page, 'Raid');
    await act(partner.page, 'Accept and open');

    for (const [funder, amount, total] of [[lead, '10', 10], [partner, '90', 100]]) {
      await act(funder.page, 'Get 100 test USDC');
      await expect(funder.page.locator('#sheet')).toContainText('Your wallet: 100');
      await funder.page.fill('#bounty', amount);
      await act(funder.page, 'Escrow on C-Chain');
      await expect(funder.page.locator('#sheet')).toContainText(`bounty ${total} USDC`, { timeout: 30_000 });
    }
    await lead.page.fill('#bounty', '1');
    await act(lead.page, 'Escrow on C-Chain');
    await expect(lead.page.locator('#sheet .notice')).toContainText('0 test USDC remaining');

    await tab(helper.page, 'Raid');
    await act(helper.page, 'Sail & attack');
    await expect(helper.page.locator('#sheet')).toContainText('Your damage: 10');
    const leadAttack = partner.page.locator('#sheet button', { hasText: 'Sail & attack' });
    await expect(leadAttack).toContainText('crew power 70');
    await leadAttack.click();
    await expect(partner.page.locator('#sheet')).toContainText('Your damage: 70');
    await partner.page.screenshot({ path: 'test-results/lantern-phone-raid.png' });

    await advanceTo(endsAt + 1n);
    await act(lead.page, 'Settle last raid');
    const claimable = () => vault.readContract({
      address: cfg.escrow, abi: escrowAbi, functionName: 'claimable', args: [lead.address]
    });
    await expect.poll(claimable).toBe(10_000000n);
    await act(lead.page, 'Claim 10 USDC');
    await expect.poll(claimable).toBe(0n);

    // Three live Phaser pages starve the CI runner's software WebGL; the desktop page took >20 s to boot.
    await Promise.all([lead, partner, helper].map(c => c.page.close()));
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.goto(`/?captain=${lead.address}`);
      await expect(desktopPage.locator('#sheet')).toContainText('Treasure cabinet', { timeout: 60_000 });
      await desktopPage.screenshot({ path: 'test-results/lantern-desktop-cabinet.png' });
      // Nothing may sit on top of the map on desktop (regression: an empty overlay box used to block drag and zoom).
      expect(await desktopPage.evaluate(() => document.elementFromPoint(400, 450)?.tagName)).toBe('CANVAS');
    } finally {
      await desktop.close();
    }
  });
});
