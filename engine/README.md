# 2048 engine

This app uses a WebAssembly adaptation of [nneonneo/2048-ai](https://github.com/nneonneo/2048-ai), pinned to revision `41e298f4571a9505e421e3a19af7a1cb372a368c`. Upstream source and its MIT license are kept in `vendor/2048-ai/`; `provenance.json` records exact file hashes.

## Engine

The build extracts the upstream bitboard moves, lookup-table initialization, heuristic weights, probability pruning and expectimax traversal directly from the pinned `2048.cpp`. The game still applies its own move and spawn rules; the engine only chooses a direction.

## Browser adaptation

- A fixed 262144-slot transposition table replaces `unordered_map`. Board keys and per-root epochs prevent collision or cross-search reuse of unrelated values.
- The upstream depth rule, `max(3, distinct tile ranks - 2)`, is capped at 6. This setting is independent of playback speed. The audio/visual queue provides lookahead.
- The binary has 16 MiB of fixed linear memory and imports only `Math.pow`, used during lookup-table initialization.
- Root move selection skips illegal moves explicitly, including unusual dense boards with negative heuristic scores.
- Directions are translated from upstream's up/down/left/right order to the app's string directions.
- Upstream uses four-bit tile ranks and saturates 32768+32768. For boards containing 32768 or larger tiles, the adapter uses the existing integer-based JavaScript search. This fallback is less optimized than the native engine.

## Rebuild

The prebuilt `2048.wasm` is included; running the app needs only Node.js. Rebuilding needs Clang with the wasm32 target and LLD's `wasm-ld`:

```sh
npm run build:engine
```

Set `CXX` and `WASM_LD` if the tools are not on PATH. `scripts/build-engine.mjs` verifies upstream hashes, extracts the core in a temporary build directory, compiles `bridge.cpp`, and rejects unexpected WASM imports.

## Validation

```sh
npm test
node scripts/benchmark-engine.mjs
```

The native move tables are compared with the app's rules over 2000 generated boards in all four directions. Tests cover terminal states, direction mapping, high-bit packing, cache reuse and the large-tile fallback.

The benchmark compares both engines using the same seeded random-number generator and reports reached tiles and search latency. `SEEDS`, `ENGINES`, `MOVE_LIMIT` and `TILE_TARGET` can narrow a run. Reaching a target stops that trial; results are not a win-rate estimate or a claim to reproduce upstream's published benchmark.
