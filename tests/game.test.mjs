import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, slide, spawn, newGame, isGameOver } from '../game.js';
import { chooseMove } from '../solver.js';

test('equal tiles merge once per move, scoring the resulting values', () => {
  const board = [2, 2, 2, 2, 4, 4, 8, 0, 2, 0, 2, 2, 0, 0, 0, 0];
  const result = slide(board, 'left');
  assert.deepEqual(result.board, [4, 4, 0, 0, 8, 8, 0, 0, 4, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(result.score, 20);
  assert.equal(result.merges.length, 4);
  assert.deepEqual(board.slice(0, 4), [2, 2, 2, 2]);
});

test('all four directions preserve mass and animate every source tile', () => {
  const board = [2, 4, 0, 2, 2, 4, 0, 2, 0, 8, 8, 0, 0, 0, 8, 0];
  for (const direction of DIRECTIONS) {
    const result = slide(board, direction);
    assert.equal(result.board.reduce((a, b) => a + b, 0), board.reduce((a, b) => a + b, 0));
    assert.equal(result.movements.length, board.filter(Boolean).length);
    assert.equal(new Set(result.movements.map(m => m.from)).size, result.movements.length);
  }
  assert.deepEqual(slide([2, 2, 4, 4, ...Array(12).fill(0)], 'right').board.slice(0, 4), [0, 0, 4, 8]);
  const vertical = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0];
  assert.deepEqual(slide(vertical, 'up').board.filter((_, i) => i % 4 === 0), [4, 8, 0, 0]);
  assert.deepEqual(slide(vertical, 'down').board.filter((_, i) => i % 4 === 0), [0, 0, 4, 8]);
});

test('invalid moves and full-board spawns do not mutate the board', () => {
  const board = [2, ...Array(15).fill(0)];
  assert.equal(slide(board, 'left').changed, false);
  assert.equal(slide(board, 'up').changed, false);
  const full = Array(16).fill(2);
  assert.deepEqual(spawn(full), { board: full, index: -1 });
});

test('spawns occupy an empty square and follow the 2/4 probability boundary', () => {
  const board = [4, ...Array(15).fill(0)];
  const inputs = [0, 0.89];
  assert.equal(spawn(board, () => inputs.shift()).board[1], 2);
  const inputs4 = [0, 0.9];
  assert.equal(spawn(board, () => inputs4.shift()).board[1], 4);
  assert.equal(newGame(() => 0).filter(Boolean).length, 2);
});

test('2048 continues, while a full board without adjacent equal tiles ends', () => {
  const dead = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  assert.equal(isGameOver(dead), true);
  assert.equal(chooseMove(dead), null);
  assert.equal(isGameOver([2048, ...Array(15).fill(0)]), false);
  assert.equal(isGameOver(Array(16).fill(2)), false);
});

test('solver chooses a legal move and saves the only available merge', () => {
  const board = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 32];
  const direction = chooseMove(board);
  assert.ok(['left', 'right'].includes(direction));
  assert.equal(slide(board, direction).changed, true);
});

test('seeded self-play has legal moves and no lost tile mass across 100 steps', () => {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  let board = newGame(random);
  for (let step = 0; step < 100 && !isGameOver(board); step++) {
    const move = slide(board, chooseMove(board, { depth: 2, budget: 4000 }));
    assert.ok(move.changed);
    const next = spawn(move.board, random).board;
    const added = next.reduce((a, b) => a + b, 0) - board.reduce((a, b) => a + b, 0);
    assert.ok(added === 2 || added === 4);
    board = next;
  }
  assert.ok(Math.max(...board) >= 64);
});
