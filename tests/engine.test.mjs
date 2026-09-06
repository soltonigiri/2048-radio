import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, packBoard, unpackBoard, ENGINE_DIRECTIONS } from '../engine.js';
import { slide } from '../game.js';

const bytes = readFileSync(new URL('../engine/2048.wasm', import.meta.url));
const engine = await createEngine(bytes);

test('native engine has no network, filesystem, clock or dynamic runtime imports', () => {
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), [{ module: 'env', name: 'pow', kind: 'function' }]);
});

test('64-bit packing preserves every cell, including the high sign bit', () => {
  const board = [0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
  assert.deepEqual(unpackBoard(packBoard(board)), board);
  assert.throws(() => packBoard([65536, ...Array(15).fill(0)]));
});

test('upstream WASM moves agree with the app rules in 2000 boards and all directions', () => {
  let state = 2048;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2000; i++) {
    const board = Array.from({ length: 16 }, () => { const rank = Math.floor(random() * 15); return rank ? 2 ** rank : 0; });
    for (const [direction, index] of ENGINE_DIRECTIONS.map((direction, index) => [direction, index])) {
      assert.deepEqual(unpackBoard(engine.native.engine_move(packBoard(board), index)), slide(board, direction).board);
    }
  }
});

test('engine handles terminal boards and the only available merge', () => {
  const dead = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  assert.equal(engine.choose(dead).direction, null);
  const board = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 32];
  const result = engine.choose(board);
  assert.equal(result.engine, 'nneonneo-wasm');
  assert.ok(['left', 'right'].includes(result.direction));
  assert.ok(slide(board, result.direction).changed);
  const dense = Array(16).fill(16384);
  assert.ok(slide(dense, engine.choose(dense).direction).changed);
});

test('32768 and larger tiles retain full game values through the extended fallback', () => {
  const board = [32768, 32768, 65536, 0, ...Array(12).fill(0)];
  const result = engine.choose(board);
  assert.equal(result.engine, 'extended-js');
  assert.ok(slide(board, result.direction).changed);
  assert.deepEqual(board.slice(0, 4), [32768, 32768, 65536, 0]);
});

test('repeated searches do not reuse stale cache entries from another root', () => {
  const board = [1024, 512, 256, 128, 2, 4, 8, 64, 0, 0, 4, 32, 0, 0, 2, 16];
  const first = engine.choose(board);
  engine.choose([2, 2, 4, 0, ...Array(12).fill(0)]);
  assert.deepEqual(engine.choose(board), first);
});
