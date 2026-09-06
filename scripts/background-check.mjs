import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(join(tmpdir(), 'radio-background-'));
// Use Chromium directly: Playwright's page sessions force focus/visibility,
// even when another CDP session disables focus emulation.
const browserProcess = spawn(chromium.executablePath(), ['--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  const address = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Chromium did not start')), 10000);
    browserProcess.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    browserProcess.once('error', error => { clearTimeout(timeout); reject(error); });
  });
  socket = new WebSocket(address);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.events=[];document.addEventListener("radio:move",({detail})=>window.events.push(detail));' }, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await wait(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  await send('Page.navigate', { url: globalThis.process.env.RADIO_URL || 'http://127.0.0.1:2048' }, sessionId);
  await send('Target.activateTarget', { targetId });
  await until('document.readyState === "complete" && Boolean(document.getElementById("play-button"))');
  // START itself is covered with real clicks in autoplay-check; grant the
  // same gesture here without depending on window-manager mouse placement.
  await send('Runtime.evaluate', { expression: 'document.getElementById("play-button").click()', userGesture: true }, sessionId);
  await until('(async()=> (await import("/app.js")).audio.clock()?.time > 0)()');
  const other = await send('Target.createTarget', { url: 'about:blank' });
  const readings = [];
  for (const [speed, duration] of [['1', 12000], ['max', 1500]]) {
    await send('Target.activateTarget', { targetId });
    await until('!document.hidden');
    await evaluate(`document.querySelector('[data-speed="${speed}"]').click()`);
    const before = await evaluate('(async()=>{const{audio}=await import("/app.js");window.originalSource=audio.source;window.events=[];return audio.clock().time})()');
    await send('Target.activateTarget', { targetId: other.targetId });
    await until('document.hidden');
    await wait(duration);
    const after = await evaluate('(async()=>{const{audio}=await import("/app.js");return{hidden:document.hidden,paused:audio.paused,time:audio.clock()?.time,sameSource:audio.source===window.originalSource,moves:window.events.length,claps:window.events.filter(e=>e.clap).length,effects:document.querySelector(".merge-effects").childElementCount}})()');
    assert.equal(after.hidden, true); assert.equal(after.paused, false); assert.equal(after.sameSource, true);
    assert.ok(after.time - before > duration / 1000 - .3);
    assert.ok(after.moves > 0 && after.claps > 0, 'Hidden game and hand claps continue');
    assert.equal(after.effects, 0);
    readings.push({ speed, ...after });
  }
  await evaluate('(async()=>{const{audio}=await import("/app.js");audio.seek(audio.buffer.duration-.8)})()');
  await wait(1600);
  assert.ok(await evaluate('(async()=>{const clock=(await import("/app.js")).audio.clock();return clock&&clock.time>0&&clock.time<2})()'), 'BGM repeats while hidden');
  await evaluate('document.getElementById("play-button").click()');
  const paused = await evaluate('window.events.length');
  await wait(300);
  await send('Target.activateTarget', { targetId });
  assert.equal(await evaluate('window.events.length'), paused);
  assert.equal(await evaluate('document.getElementById("play-button").getAttribute("aria-label")'), '再開');
  assert.deepEqual(errors, []);
  const result = { result: 'PASS', readings, checks: 'Actual hidden tabs without focus emulation, unchanged audio source, advancing music/game/claps, no hidden effects, BGM loop, manual pause stays paused after return' };
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/background-verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  await send('Browser.close');
} finally {
  socket?.close(); browserProcess.kill();
  await new Promise(resolve => { if (browserProcess.exitCode !== null) resolve(); else { browserProcess.once('exit', resolve); setTimeout(resolve, 2000); } });
  await rm(profile, { recursive: true, force: true });
}
