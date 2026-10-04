import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { TRACKS } from '../tracks.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.RADIO_URL || 'http://127.0.0.1:2048';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const errors = [];
const requests = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
});
await context.addInitScript(() => {
  window.beatEvents = [];
  document.addEventListener('radio:move', event => window.beatEvents.push({ ...event.detail, stamp: performance.now() }));
});
const app = async (page, expression) => page.evaluate(async expression => {
  const { audio } = await import('/app.js');
  return expression === 'clock' ? audio.clock() : { enabled: audio.enabled, selected: audio.selected, offset: audio.offset, playing: Boolean(audio.source), rate: audio.source?.playbackRate.value };
}, expression);
const pause = async page => {
  await page.getByRole('button', { name: '一時停止', exact: true }).click();
  await page.waitForTimeout(220);
};
const resume = page => page.getByRole('button', { name: '再開', exact: true }).click();
const soundOn = async page => {
  if (await page.locator('#sound-button').getAttribute('aria-pressed') === 'false') await page.getByRole('button', { name: '音をオンにする', exact: true }).click();
  await page.waitForFunction(async () => Boolean((await import('/app.js')).audio.buffer));
  await page.waitForFunction(() => document.querySelector('#sound-button').getAttribute('aria-pressed') === 'true');
};

try {
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  const page = await context.newPage();
  await page.goto(baseURL);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `START overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: new URL('../artifacts/start-mobile.png', import.meta.url).pathname, fullPage: true });
  }
  await page.getByRole('button', { name: 'スタート', exact: true }).click();
  await page.waitForFunction(() => window.beatEvents.length >= 4);
  await pause(page);
  const pausedMoves = await page.evaluate(() => window.beatEvents.length);
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => window.beatEvents.length), pausedMoves);
  await soundOn(page);
  await resume(page);
  const levels = await page.evaluate(async () => {
    const { audio } = await import('/app.js');
    const analyser = audio.context.createAnalyser();
    audio.master.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      analyser.getFloatTimeDomainData(samples);
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
    }
    audio.master.disconnect(analyser);
    return { state: audio.context.state, peak };
  });
  assert.equal(levels.state, 'running');
  assert.ok(levels.peak > 0.001 && levels.peak < 1);

  // Measure actual rendered commits against the audio output clock at all speeds.
  const samples = [];
  for (const division of [0.5, 1, 2, 4]) {
    await page.locator(`[data-speed="${division}"]`).click();
    await page.waitForFunction(division => window.beatEvents.at(-1)?.subdivision === division, division);
    await page.evaluate(() => { window.beatEvents = []; });
    await page.waitForTimeout(division <= 1 ? 2200 : 1500);
    const events = await page.evaluate(() => window.beatEvents.filter(e => e.source === 'audio'));
    assert.ok(events.length >= (division <= 1 ? 1 : 3), `No moves at ${division} per beat`);
    for (const event of events) {
      assert.equal(event.subdivision, division);
      const track = TRACKS[event.track];
      const coordinate = (event.target - track.beatOffset) / (60 / track.bpm / division);
      assert.ok(Math.abs(coordinate - Math.round(coordinate)) < 1e-6, 'Off-grid target');
      assert.ok(event.time >= event.target && event.time - event.target <= 0.046, 'Late merge');
    }
    samples.push(...events);
    assert.equal((await app(page, 'state')).rate, 1);
  }

  // Pause/resume and a long main-thread stall cannot reset musical phase or burst.
  await pause(page);
  const state = await app(page, 'state');
  await page.waitForTimeout(700);
  assert.equal((await app(page, 'state')).offset, state.offset);
  await resume(page);
  await page.evaluate(() => { const end = performance.now() + 180; while (performance.now() < end) {} });
  await page.waitForTimeout(500);
  const lastEvents = await page.evaluate(() => window.beatEvents.slice(-8));
  assert.ok(lastEvents.every(e => e.time - e.target <= 0.046));

  await pause(page);
  await page.getByRole('button', { name: '次の盤面', exact: true }).click();
  assert.equal(await page.locator('#score').textContent(), '0');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('2048-radio-history-v2'))[0].reason), 'skipped');
  await resume(page);
  assert.equal(TRACKS.length, 1);
  assert.equal(await page.locator('#track-title').textContent(), 'Lobby Time');
  const beforeLoop = await page.evaluate(async () => {
    const { audio } = await import('/app.js');
    audio.seek(audio.buffer.duration - 0.8);
    return audio.revision;
  });
  await page.waitForFunction(async revision => {
    const { audio } = await import('/app.js');
    const clock = audio.clock();
    return clock && clock.revision > revision && clock.time >= 0 && clock.time < 1.5;
  }, beforeLoop);
  assert.equal((await app(page, 'clock')).track, 0);
  assert.equal((await app(page, 'state')).rate, 1);
  assert.equal((await app(page, 'state')).enabled, true);

  await page.getByRole('button', { name: '音をオフにする', exact: true }).click();
  assert.equal((await app(page, 'state')).playing, false);
  await soundOn(page);
  await page.waitForTimeout(350);
  assert.equal((await app(page, 'clock')).source, undefined);
  await page.waitForFunction(async () => (await import('/app.js')).audio.clock()?.time >= 0);
  await page.getByRole('button', { name: 'Credits' }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(node => node.open), false);
  await pause(page);
  await page.screenshot({ path: new URL('../artifacts/desktop.png', import.meta.url).pathname, fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: new URL('../artifacts/mobile.png', import.meta.url).pathname, fullPage: true });
  }
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('2048-radio-history-v2')).length), 1);
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');

  const maxContext = await browser.newContext();
  const maxPage = await maxContext.newPage();
  await maxPage.goto(baseURL);
  await maxPage.getByRole('button', { name: 'スタート', exact: true }).click();
  await maxPage.waitForFunction(async () => Boolean((await import('/app.js')).audio.source));
  const maxSpeed = await maxPage.evaluate(await (await import('node:fs/promises')).readFile(new URL('../tests/max-speed.browser.js', import.meta.url), 'utf8'));
  await maxPage.locator('[data-speed="max"]').click();
  await pause(maxPage);
  for (const width of [1440, 390, 320]) {
    await maxPage.setViewportSize({ width, height: 844 });
    assert.equal(await maxPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `MAX overflow at ${width}px`);
    assert.equal(await maxPage.locator('[data-speed="max"]').getAttribute('aria-pressed'), 'true');
    if (width === 390) await maxPage.screenshot({ path: new URL('../artifacts/max-mobile.png', import.meta.url).pathname, fullPage: true });
  }
  await maxContext.close();

  const endingContext = await browser.newContext();
  await endingContext.route('**/game.js', async route => {
    const response = await route.fetch();
    const body = 'let firstFixture = true;\n' + (await response.text()).replace(
      'export function newGame(random = Math.random) {',
      'export function newGame(random = Math.random) { if (firstFixture) { firstFixture = false; return [2,4,8,16,32,64,128,256,512,1024,2,4,8,16,32,32]; }',
    );
    await route.fulfill({ response, body });
  });
  const endingPage = await endingContext.newPage();
  await endingPage.goto(baseURL);
  await endingPage.getByRole('button', { name: 'スタート', exact: true }).click();
  await endingPage.locator('#board-overlay').waitFor({ state: 'visible' });
  await pause(endingPage);
  await endingPage.waitForTimeout(2400);
  assert.equal(await endingPage.locator('#board-overlay').isVisible(), true);
  await resume(endingPage);
  await endingPage.locator('#board-overlay').waitFor({ state: 'hidden' });
  assert.equal(await endingPage.evaluate(() => JSON.parse(localStorage.getItem('2048-radio-history-v2')).length), 1);
  const maxEndingPage = await endingContext.newPage();
  await maxEndingPage.goto(baseURL);
  await maxEndingPage.getByRole('button', { name: 'スタート', exact: true }).click();
  await maxEndingPage.locator('[data-speed="max"]').click();
  await maxEndingPage.locator('#board-overlay').waitFor({ state: 'visible' });
  await maxEndingPage.locator('#board-overlay').waitFor({ state: 'hidden' });
  assert.equal(await maxEndingPage.locator('[data-speed="max"]').getAttribute('aria-pressed'), 'true');
  await endingContext.close();
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => new URL(url).origin === new URL(baseURL).origin));
  const errorsMs = samples.map(e => (e.time - e.target) * 1000).sort((a, b) => a - b);
  const result = { result: 'PASS', movesMeasured: samples.length, mergeMoves: samples.filter(e => e.merges > 0).length, timingMs: { median: errorsMs[Math.floor(errorsMs.length * .5)], p95: errorsMs[Math.floor(errorsMs.length * .95)], max: errorsMs.at(-1) }, levels, checks: ['four beat divisions', 'speed changes on beat boundaries', 'single-track loop', 'actual merge timing', 'pause/resume', 'stall recovery', 'seek', 'automatic BGM repeat', 'original playback rate', 'mute', 'history', 'responsive layout', 'automatic next board', 'no console errors', 'no external requests'] };
  result.maxSpeed = maxSpeed;
  result.checks.push('MAX mode, switches, claps and automatic next board');
  console.log(JSON.stringify(result, null, 2));
  await (await import('node:fs/promises')).writeFile(new URL('../artifacts/verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
} finally { await browser.close(); }
