import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RadioAudio } from '../audio.js';

function fixture() {
  const audio = new RadioAudio();
  const sources = [];
  const gains = [];
  const node = () => ({ connect(destination) { this.destination = destination; return destination; }, disconnect() { this.disconnected = true; } });
  audio.context = {
    currentTime: 12,
    createBufferSource() {
      const source = { ...node(), start(time) { this.time = time; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
    createGain() { const gain = { ...node(), gain: {} }; gains.push(gain); return gain; },
  };
  audio.master = node();
  audio.enabled = true;
  audio.source = { bgm: true };
  audio.clapBuffer = { duration: .186 };
  audio.startedAt = 10;
  audio.offset = 20;
  return { audio, sources, gains };
}

test('clap uses the BGM timeline and shared master volume', () => {
  const { audio, sources, gains } = fixture();
  const clap = audio.scheduleClap(22.1);
  assert.ok(Math.abs(clap.at - 12.1) < 1e-8);
  assert.equal(sources[0].buffer, audio.clapBuffer);
  assert.equal(sources[0].time, clap.at);
  assert.equal(sources[0].destination, gains[0]);
  assert.equal(gains[0].destination, audio.master);
});

test('disabled, paused, muted and unloaded claps never create sources', () => {
  for (const [field, value] of [['enabled', false], ['paused', true], ['clapEnabled', false], ['source', null], ['clapBuffer', null]]) {
    const { audio, sources } = fixture(); audio[field] = value;
    assert.equal(audio.scheduleClap(22), null);
    assert.equal(sources.length, 0);
  }
});

test('turning claps off cancels queued voices without stopping BGM', async () => {
  const { audio, sources } = fixture();
  const bgm = audio.source;
  audio.scheduleClap(22.1); audio.scheduleClap(22.2);
  await audio.setClapEnabled(false);
  assert.equal(audio.source, bgm);
  assert.equal(audio.enabled, true);
  assert.equal(audio.claps.size, 0);
  assert.ok(sources.every(source => source.stopped && source.disconnected));
  await audio.setClapEnabled(true);
  assert.ok(audio.scheduleClap(22.3));
});

test('cancelled moves and finished sounds release their audio nodes', () => {
  const { audio } = fixture();
  const cancelled = audio.scheduleClap(22.1);
  audio.cancelClap(cancelled); audio.cancelClap(cancelled);
  assert.equal(audio.claps.size, 0);
  const finished = audio.scheduleClap(22.2);
  finished.source.onended();
  assert.equal(audio.claps.size, 0);
  assert.equal(finished.gain.disconnected, true);
});

test('late preparation starts immediately instead of scheduling in the past', () => {
  const { audio } = fixture();
  const clap = audio.scheduleClap(21.99);
  assert.equal(clap.at, audio.context.currentTime);
});

test('lookahead includes long device latency instead of starving fast playback', () => {
  const { audio } = fixture();
  audio.outputTime = () => audio.context.currentTime - 1.1;
  assert.ok(audio.lookAhead() > 1.2);
});

test('a missing optional clap can be retried and does not disable BGM', async () => {
  const { audio } = fixture();
  audio.clapBuffer = null;
  audio.loadClap = async () => { throw new Error('missing sample'); };
  await assert.rejects(audio.setClapEnabled(true), /missing sample/);
  assert.equal(audio.clapEnabled, false);
  assert.equal(audio.enabled, true);
  assert.ok(audio.source);
  audio.loadClap = async () => { audio.clapBuffer = { duration: .186 }; };
  await audio.setClapEnabled(true);
  assert.ok(audio.scheduleClap(22.1));
});

test('a single-track playlist restarts the song and preserves pause or mute', async () => {
  for (const [enabled, paused] of [[true, false], [true, true], [false, false]]) {
    const audio = new RadioAudio();
    audio.enabled = enabled; audio.paused = paused;
    audio.buffer = { duration: 30 }; audio.offset = 29;
    const starts = [];
    audio.start = offset => starts.push(offset);
    await audio.next();
    assert.equal(audio.offset, 0);
    assert.deepEqual(starts, enabled && !paused ? [0] : []);
    assert.equal(audio.selected, 0);
  }
});
