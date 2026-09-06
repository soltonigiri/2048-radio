import { DIRECTIONS, slide } from './game.js';

export function evaluate(board) {
  const logs = board.map(v => v ? Math.log2(v) : 0);
  const max = Math.max(...logs);
  let smooth = 0;
  let monotone = 0;
  let pairs = 0;
  for (let line = 0; line < 4; line++) {
    for (const column of [false, true]) {
      const values = Array.from({ length: 4 }, (_, i) => logs[column ? i * 4 + line : line * 4 + i]);
      let rising = 0;
      let falling = 0;
      for (let i = 0; i < 3; i++) {
        const diff = values[i + 1] - values[i];
        rising += Math.max(0, diff);
        falling += Math.max(0, -diff);
      }
      monotone += Math.min(rising, falling);
      const nonzero = values.filter(Boolean);
      for (let i = 1; i < nonzero.length; i++) {
        smooth += Math.abs(nonzero[i] - nonzero[i - 1]);
        if (nonzero[i] === nonzero[i - 1]) pairs++;
      }
    }
  }
  const corner = [0, 3, 12, 15].some(i => logs[i] === max);
  return logs.filter(v => !v).length * 280 - monotone * 85 - smooth * 12 + pairs * 35 + (corner ? max * 65 : -max * 65);
}

// Expectimax considers both possible tile values and every empty spawn position.
// A bounded node budget keeps each worker request comfortably below a beat.
export function chooseMove(board, { depth = board.filter(v => !v).length >= 6 ? 2 : 3, budget = 6000, timeBudget = Infinity } = {}) {
  let nodes = 0;
  let deadline = Infinity;
  const cache = new Map();
  const exhausted = () => nodes++ > budget || performance.now() >= deadline;
  function player(state, remaining) {
    if (remaining === 0 || exhausted()) return evaluate(state);
    const key = `${remaining}:${state.join(',')}`;
    if (cache.has(key)) return cache.get(key);
    let best = -20000;
    for (const direction of DIRECTIONS) {
      const move = slide(state, direction);
      if (move.changed) best = Math.max(best, chance(move.board, remaining - 1) + move.score * 0.05);
    }
    cache.set(key, best);
    return best;
  }
  function chance(state, remaining) {
    if (exhausted()) return evaluate(state);
    const empty = state.flatMap((v, i) => !v ? [i] : []);
    if (!empty.length) return player(state, remaining);
    let sum = 0;
    for (const i of empty) {
      const child = [...state];
      child[i] = 2;
      sum += 0.9 * player(child, remaining);
      child[i] = 4;
      sum += 0.1 * player(child, remaining);
    }
    return sum / empty.length;
  }
  let best = -Infinity;
  let direction = null;
  // Reset the budget per root candidate so later directions get equal search.
  for (const candidate of DIRECTIONS) {
    const move = slide(board, candidate);
    if (!move.changed) continue;
    nodes = 0;
    deadline = performance.now() + timeBudget / 4;
    const value = chance(move.board, depth - 1) + move.score * 0.05;
    if (value > best) { best = value; direction = candidate; }
  }
  return direction;
}
