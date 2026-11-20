import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createPublicClient, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { homeOf, lanes } from '../../web/src/world.js';

export const PHONE = { width: 390, height: 844 };

export function loadConfig() {
  return JSON.parse(readFileSync('.local/config.json', 'utf8'));
}

export function loadAbi(name) {
  return JSON.parse(readFileSync(`web/src/generated/${name}.json`, 'utf8'));
}

export function gameClient(cfg) {
  return createPublicClient({ transport: http(cfg.game.rpcUrl) });
}

export function guestKey(label) {
  return keccak256(toHex(label));
}

/** Derive a deterministic key whose home island satisfies `predicate`. */
export async function findCaptainKey(cfg, prefix, predicate) {
  const seaAbi = loadAbi('LanternSea');
  const seed = await gameClient(cfg).readContract({ address: cfg.sea, abi: seaAbi, functionName: 'worldSeed' });
  for (let i = 1; ; i++) {
    const key = guestKey(`${prefix}-${i}`);
    const addr = privateKeyToAccount(key).address;
    if (predicate(lanes(seed, 256, homeOf(seed, 256, addr)))) return key;
  }
}

export async function captain(browser, key) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, hasTouch: true });
  await context.addInitScript(k => sessionStorage.setItem('lantern-guest-key', k), key);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  return { context, page, errors, address: privateKeyToAccount(key).address };
}

export async function registerCaptain(captainHandle) {
  await expect(captainHandle.page.getByRole('button', { name: 'Claim my island' })).toBeVisible({ timeout: 20_000 });
  await captainHandle.page.getByRole('button', { name: 'Claim my island' }).click();
  await expect(captainHandle.page.locator('.badge.home')).toBeVisible({ timeout: 20_000 });
  expect(await captainHandle.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** Launch, register, run `fn`, assert zero page errors, and close all contexts. */
export async function withCaptains(browser, keys, fn) {
  const handles = await Promise.all(keys.map(key => captain(browser, key)));
  try {
    for (const handle of handles) await registerCaptain(handle);
    await fn(handles);
    expect(handles.flatMap(handle => handle.errors)).toEqual([]);
  } finally {
    await Promise.all(handles.map(handle => handle.context.close()));
  }
}

export const tab = (page, name) => page.locator('.tabs button', { hasText: name }).click();
export const act = (page, text) => page.locator('#sheet button, .modal button', { hasText: text }).first().click();
