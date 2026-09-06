import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const results = [];
for (const policy of ['document-user-activation-required', 'no-user-gesture-required']) {
  const browser = await chromium.launch({ headless: true, args: [`--autoplay-policy=${policy}`] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.moves = 0;
      document.addEventListener('radio:move', () => window.moves++);
    });
    await page.goto(process.env.RADIO_URL || 'http://127.0.0.1:2048');
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => window.moves), 0);
    assert.equal(await page.getByRole('button', { name: 'スタート', exact: true }).isVisible(), true);
    assert.equal(await page.locator('[data-speed="1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(async () => Boolean((await import('/app.js')).audio.source)), false);
    await page.locator('h1').click();
    await page.locator('[data-speed="2"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.moves), 0);
    assert.equal(await page.evaluate(async () => Boolean((await import('/app.js')).audio.source)), false);
    await page.getByRole('button', { name: 'スタート', exact: true }).click();
    await page.waitForFunction(async () => {
      const { audio } = await import('/app.js');
      return window.moves >= 3 && audio.enabled && audio.source && audio.context.state === 'running';
    });
    await page.getByRole('button', { name: '一時停止', exact: true }).click();
    const pausedMoves = await page.evaluate(() => window.moves);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.moves), pausedMoves);
    assert.equal(await page.evaluate(async () => Boolean((await import('/app.js')).audio.source)), false);
    await page.getByRole('button', { name: '再開', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(async () => Boolean((await import('/app.js')).audio.source));
    await page.getByRole('button', { name: '音をオフにする', exact: true }).click();
    await page.locator('h1').click();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(async () => (await import('/app.js')).audio.enabled), false);
    assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(errors, []);
    results.push({ policy, result: 'PASS', checks: 'Initially stopped and silent, settings do not start playback, START begins audio and game, pause/resume, Space and mute' });
  } finally { await browser.close(); }
}
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/autoplay-verification.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
