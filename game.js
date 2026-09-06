export const DIRECTIONS = ['left', 'up', 'right', 'down'];

export function slide(board, direction) {
  if (!DIRECTIONS.includes(direction)) throw new Error('Unknown direction');
  const next = Array(16).fill(0);
  const movements = [];
  const merges = [];
  let score = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, n) => {
      if (direction === 'left') return line * 4 + n;
      if (direction === 'right') return line * 4 + 3 - n;
      if (direction === 'up') return n * 4 + line;
      return (3 - n) * 4 + line;
    });
    const occupied = indices.filter(i => board[i]);
    let destination = 0;
    for (let j = 0; j < occupied.length; j++) {
      const from = occupied[j];
      const to = indices[destination++];
      const value = board[from];
      const merged = j + 1 < occupied.length && board[occupied[j + 1]] === value;
      movements.push({ from, to, value, merged });
      if (merged) {
        movements.push({ from: occupied[++j], to, value, merged: true });
        next[to] = value * 2;
        score += value * 2;
        merges.push({ index: to, value: value * 2 });
      } else next[to] = value;
    }
  }
  return { board: next, score, merges, movements, changed: next.some((v, i) => v !== board[i]) };
}

export function spawn(board, random = Math.random) {
  const empty = board.flatMap((v, i) => v === 0 ? [i] : []);
  if (!empty.length) return { board: [...board], index: -1 };
  const index = empty[Math.floor(random() * empty.length)];
  const next = [...board];
  next[index] = random() < 0.9 ? 2 : 4;
  return { board: next, index };
}

export function newGame(random = Math.random) {
  return spawn(spawn(Array(16).fill(0), random).board, random).board;
}

export function isGameOver(board) {
  if (board.includes(0)) return false;
  for (let i = 0; i < 16; i++) {
    if (i % 4 < 3 && board[i] === board[i + 1]) return false;
    if (i < 12 && board[i] === board[i + 4]) return false;
  }
  return true;
}
