// Run on the local app with: agent-browser eval --stdin < tests/motion.browser.js
(async () => {
  const { BoardMotion } = await import('/motion.js');
  const { slide, spawn, newGame, DIRECTIONS } = await import('/game.js');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const boardElement = document.createElement('div');
  boardElement.className = 'board';
  boardElement.style.cssText = 'position:fixed;width:400px;left:-1000px;top:0';
  const layer = document.createElement('div'); layer.className = 'tiles';
  boardElement.append(layer); document.body.append(boardElement);
  const preference = { matches: false };
  const motion = new BoardMotion(boardElement, layer, preference);
  const context = { direction: 'left', beat: 0, onBeat: true, onDownbeat: true, previousMax: 64, fast: false };
  const passed = [];
  try {
    let board = [64, 64, 0, 0, ...Array(12).fill(0)];
    motion.reset(board);
    let result = slide(board, 'left');
    motion.prepare(result, .07);
    assert(layer.querySelectorAll('.anticipating').length === 2, 'Both actual incoming tiles anticipate');
    motion.commit(result, { board: result.board, index: -1 }, context);
    const survivor = motion.tiles.get(0);
    const burst = survivor.querySelector('.merge-burst');
    assert(burst, 'Merge particles belong to their tile');
    const bounce = survivor.querySelector('.tile-body').getAnimations()[0];
    assert(bounce, 'Merge starts an impact');
    result = slide(result.board, 'down');
    motion.prepare(result, .035);
    motion.commit(result, { board: result.board, index: -1 }, { ...context, direction: 'down', fast: true });
    assert(motion.tiles.get(12) === survivor, 'Next move preserves tile identity');
    assert(burst.parentElement === survivor, 'Particles follow the surviving tile');
    const tileRect = survivor.getBoundingClientRect();
    const burstRect = burst.getBoundingClientRect();
    assert(Math.abs(tileRect.x - burstRect.x) < 1 && Math.abs(tileRect.y - burstRect.y) < 1,
      'Particle origin moves with the tile after the next commit');
    assert(survivor.querySelector('.tile-body').getAnimations().includes(bounce), 'Next move preserves the SAME impact');
    await new Promise(resolve => setTimeout(resolve, 130));
    assert(survivor.isConnected && bounce.playState === 'running', 'Impact survives beyond old 51ms cutoff');
    motion.setPaused(true);
    assert(bounce.playState === 'paused', 'Pause freezes impacts');
    motion.setPaused(false);
    assert(bounce.playState === 'running', 'Resume restores impacts');
    passed.push('Impact persists through subsequent travel, commit, pause and resume');

    let seed = 29;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    board = newGame(random); motion.reset(board);
    let merges = 0;
    for (let i = 0; i < 160; i++) {
      const offset = Math.floor(random() * 4);
      const direction = [...DIRECTIONS.slice(offset), ...DIRECTIONS.slice(0, offset)].find(d => slide(board, d).changed);
      if (!direction) { board = newGame(random); motion.reset(board); continue; }
      result = slide(board, direction);
      const spawned = spawn(result.board, random);
      motion.prepare(result, i % 2 ? .02 : 0);
      motion.commit(result, spawned, { ...context, direction, previousMax: Math.max(...board), fast: true, beat: Math.floor(i / 16) });
      board = spawned.board;
      const actual = Array(16).fill(0);
      for (const tile of layer.children) {
        assert(!actual[Number(tile.dataset.index)], 'No duplicate tile destinations');
        actual[Number(tile.dataset.index)] = Number(tile.dataset.value);
      }
      assert(JSON.stringify(actual) === JSON.stringify(board), `Rendered board matches engine at move ${i}`);
      for (const merge of result.merges) assert(motion.tiles.get(merge.index).querySelector('.tile-body').getAnimations().length > 0, 'High speed retains impacts');
      merges += result.merges.length;
    }
    assert(merges > 30, 'Sequence exercises repeated merges');
    passed.push(`160 seeded moves preserve exact board state; ${merges} high-speed impacts`);
    motion.reset([64, 64, 0, 0, ...Array(12).fill(0)]);
    assert(motion.animations.size === 0 && motion.effects.childElementCount === 0, 'Reset clears transient effects');
    preference.matches = true;
    result = slide([64, 64, 0, 0, ...Array(12).fill(0)], 'left');
    motion.prepare(result, .14);
    motion.commit(result, { board: result.board, index: -1 }, context);
    assert(motion.animations.size === 0 && motion.effects.childElementCount === 0, 'Reduced motion creates no moving effects');
    assert(motion.tiles.get(0).textContent === '128', 'Reduced motion still renders results');
    passed.push('Reset cleanup and reduced motion');
    return passed;
  } finally { motion.clearEffects(); boardElement.remove(); }
})()
