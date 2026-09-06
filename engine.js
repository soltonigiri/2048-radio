import { chooseMove as chooseExtendedMove } from './solver.js';

export const ENGINE_DIRECTIONS = ['up', 'down', 'left', 'right'];

export function packBoard(board) {
  if (!Array.isArray(board) || board.length !== 16) throw new Error('Expected 16 cells');
  let packed = 0n;
  for (let index = 0; index < 16; index++) {
    const value = board[index];
    const rank = value === 0 ? 0 : Math.log2(value);
    if (!Number.isInteger(rank) || rank < 0 || rank > 15 || value === 1) throw new Error('Board exceeds the native rank range');
    packed |= BigInt(rank) << BigInt(index * 4);
  }
  return packed;
}

export function unpackBoard(packed) {
  const unsigned = BigInt.asUintN(64, packed);
  return Array.from({ length: 16 }, (_, index) => {
    const rank = Number(unsigned >> BigInt(index * 4) & 15n);
    return rank ? 2 ** rank : 0;
  });
}

export async function createEngine(bytes) {
  if (!bytes) {
    const response = await fetch(new URL('./engine/2048.wasm', import.meta.url));
    if (!response.ok) throw new Error('Could not load 2048 engine');
    bytes = await response.arrayBuffer();
  }
  const { instance } = await WebAssembly.instantiate(bytes, { env: { pow: Math.pow } });
  const native = instance.exports;
  native.engine_init();
  return {
    native,
    choose(board, { maxDepth = 6 } = {}) {
      // The upstream nibble representation saturates 32768 + 32768. Keep the
      // game's full integer rules beyond this point instead of truncating tiles.
      if (board.some(value => value >= 32768)) return {
        direction: chooseExtendedMove(board, { depth: 3, timeBudget: 30 }),
        engine: 'extended-js', depth: 3, nodes: null,
      };
      const move = native.engine_choose(packBoard(board), maxDepth);
      return {
        direction: move < 0 ? null : ENGINE_DIRECTIONS[move],
        engine: 'nneonneo-wasm', depth: native.engine_depth(), nodes: native.engine_nodes(),
      };
    },
  };
}
