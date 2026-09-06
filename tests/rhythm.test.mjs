import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervalFor, gridAfter, animationLead, tooLate, SUBDIVISIONS } from '../rhythm.js';
import { TRACKS } from '../tracks.js';

test('double and quadruple speed stay on subdivisions of the same audible beat', () => {
  const track = { bpm: 120, beatOffset: 0.125 };
  assert.equal(gridAfter(0.13, track, 1), 0.625);
  assert.equal(gridAfter(0.13, track, 2), 0.375);
  assert.equal(gridAfter(0.13, track, 4), 0.25);
  assert.equal(gridAfter(0.13, track, 0.5), 1.125);
  assert.equal(gridAfter(-0.2, track, 4), 0.125);
});

test('speed changes share a beat boundary, without resetting phase to click time', () => {
  const track = { bpm: 120, beatOffset: 0.125 };
  const switchAt = gridAfter(0.39, track);
  assert.equal(switchAt, 0.625);
  for (const multiplier of [1, 2, 4, 8, 16]) {
    assert.equal(gridAfter(switchAt - 1e-6, track, multiplier), switchAt);
  }
});

test('track offsets and long playback retain their own phase at every speed', () => {
  for (const track of TRACKS) for (const multiplier of SUBDIVISIONS) {
    const interval = intervalFor(track, multiplier);
    const time = 60 * 60 + 0.123;
    const next = gridAfter(time, track, multiplier);
    assert.ok(next > time && next <= time + interval);
    const coordinate = (next - track.beatOffset) / interval;
    assert.ok(Math.abs(coordinate - Math.round(coordinate)) < 1e-8);
  }
});

test('a stalled frame cannot trigger a burst of delayed off-beat moves', () => {
  const track = TRACKS[0];
  const target = gridAfter(1, track, 4);
  assert.equal(tooLate(target + 0.2, target, track, 4), true);
  assert.equal(tooLate(target + 0.01, target, track, 4), false);
  const recovered = gridAfter(target + 0.2, track, 4);
  assert.ok(recovered > target + 0.2);
});

test('movement can start before a beat, but high-speed and reduced-motion commits are instant', () => {
  assert.ok(animationLead(TRACKS[0], 1) > 0);
  assert.ok(animationLead(TRACKS[0], 4) < intervalFor(TRACKS[0], 4));
  assert.equal(animationLead(TRACKS[0], 16), 0);
  assert.equal(animationLead(TRACKS[0], 1, true), 0);
});
