import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createEngine } from '../engine.js';
import { chooseMove } from '../solver.js';
import { newGame, slide, spawn, isGameOver } from '../game.js';

const engine = await createEngine(readFileSync(new URL('../engine/2048.wasm', import.meta.url)));
const results = [];
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
const limit = Number(process.env.MOVE_LIMIT || 10000);
const goal = Number(process.env.TILE_TARGET || 8192);
const seeds = (process.env.SEEDS || '7,42').split(',').map(Number);
const modes = (process.env.ENGINES || 'wasm,legacy').split(',');
for (const seed of seeds) for (const mode of modes) {
  let state = seed;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  let board = newGame(random), score = 0, moves = 0;
  const timings = [];
  const started = performance.now();
  while (!isGameOver(board) && moves < limit && Math.max(...board) < goal) {
    const before = performance.now();
    const direction = mode === 'wasm' ? engine.choose(board).direction : chooseMove(board, { timeBudget: 76.171875 });
    timings.push(performance.now() - before);
    const move = slide(board, direction);
    if (!move.changed) throw new Error(`Illegal move: ${mode}, seed ${seed}, move ${moves}`);
    board = spawn(move.board, random).board; score += move.score; moves++;
    if (moves % 1000 === 0) console.log(JSON.stringify({ progress: true, mode, seed, moves, maxTile: Math.max(...board) }));
  }
  timings.sort((a, b) => a - b);
  const round = value => Math.round(value * 100) / 100;
  const result = { mode, seed, maxTile: Math.max(...board), score, moves, gameOver: isGameOver(board), reachedTarget: Math.max(...board) >= goal,
    elapsedSeconds: round((performance.now() - started) / 1000), meanMs: round(timings.reduce((a, b) => a + b, 0) / timings.length),
    p50Ms: round(timings[Math.floor(timings.length * .5)]), p95Ms: round(timings[Math.floor(timings.length * .95)]), maxMs: round(timings.at(-1)) };
  results.push(result); console.log(JSON.stringify(result));
  writeFileSync(new URL('../artifacts/engine-benchmark.json', import.meta.url), JSON.stringify({ target: goal, moveLimit: limit, upstreamRevision: '41e298f4571a9505e421e3a19af7a1cb372a368c', maxDepth: 6, results }, null, 2) + '\n');
}
