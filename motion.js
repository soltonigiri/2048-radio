// Tile identity survives each move; travel and impact use separate surfaces.
export class BoardMotion {
  constructor(board, layer, reducedMotion) {
    this.board = board;
    this.layer = layer;
    this.reducedMotion = reducedMotion;
    this.tiles = new Map();
    this.animations = new Set();
    this.lastAccentBeat = null;
    this.effects = document.createElement('div');
    this.effects.className = 'merge-effects';
    this.effects.setAttribute('aria-hidden', 'true');
    board.append(this.effects);
  }

  animate(element, frames, options, done) {
    const animation = element.animate(frames, options);
    this.animations.add(animation);
    const cleanup = () => { this.animations.delete(animation); done?.(); };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
    return animation;
  }

  position(tile, index) {
    tile.style.setProperty('--x', index % 4);
    tile.style.setProperty('--y', Math.floor(index / 4));
    tile.dataset.index = index;
  }

  effectPalette(element, value) {
    const level = Math.min(value, 2048);
    element.style.setProperty('--merge-glow', `var(--tile-${level})`);
    element.style.setProperty('--merge-ink', `var(--tile-${level}-ink)`);
  }

  value(tile, value) {
    this.effectPalette(tile, value);
    tile.dataset.value = value;
    tile.classList.toggle('large', value > 2048);
    tile.querySelector('.tile-body').textContent = value;
  }

  make(value, index) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    const travel = document.createElement('div');
    travel.className = 'tile-travel';
    const body = document.createElement('div');
    body.className = 'tile-body';
    travel.append(body); tile.append(travel);
    this.value(tile, value); this.position(tile, index);
    this.layer.append(tile);
    return tile;
  }

  clearEffects() {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.effects.replaceChildren();
    this.board.classList.remove('has-milestone');
  }

  reset(board) {
    this.clearEffects();
    this.layer.replaceChildren();
    this.tiles.clear();
    this.lastAccentBeat = null;
    board.forEach((value, index) => { if (value) this.tiles.set(index, this.make(value, index)); });
    this.describe(board);
  }

  describe(board) {
    this.board.setAttribute('aria-label', `2048の盤面。${Array.from({ length: 4 }, (_, row) => board.slice(row * 4, row * 4 + 4).map(v => v || '空').join('、')).join(' / ')}`);
  }

  prepare(result, duration) {
    if (this.reducedMotion.matches || duration < 0.012) return;
    const ms = duration * 1000;
    this.board.style.setProperty('--move-ms', `${ms}ms`);
    // Flush the previous commit's zero-duration placement before travelling.
    void this.layer.offsetWidth;
    const largest = Math.max(0, ...result.merges.map(m => m.value));
    for (const move of result.movements) {
      const tile = this.tiles.get(move.from);
      tile.classList.toggle('anticipating', move.merged && move.value * 2 === largest && largest >= 64);
      tile.style.transitionDuration = `${ms}ms`;
      this.position(tile, move.to);
      if (move.from === move.to) continue;
      const horizontal = Math.floor(move.from / 4) === Math.floor(move.to / 4);
      const stretch = horizontal ? 'scale(1.14, .88)' : 'scale(.88, 1.14)';
      this.animate(tile.firstElementChild, [
        { transform: 'scale(1)', offset: 0 },
        { transform: stretch, offset: .72 },
        { transform: 'scale(1)', offset: 1 },
      ], { duration: ms, easing: 'ease-in' });
    }
  }

  impact(tile, value, horizontal, strong, milestone, fast) {
    const body = tile.querySelector('.tile-body');
    // A tile merging again gets a fresh impact; unrelated moves leave it alone.
    for (const animation of body.getAnimations()) animation.cancel();
    const weight = Math.min(1, Math.max(0, (Math.log2(value) - 3) / 7));
    const punch = (0.23 + weight * .12 + (strong ? .035 : 0)) * (fast ? .85 : 1);
    const squish = horizontal ? `scale(${1 - punch}, ${1 + punch * .85})` : `scale(${1 + punch * .85}, ${1 - punch})`;
    const tilt = horizontal ? 2.5 : -2.5;
    tile.classList.add('merged');
    this.animate(body, [
      { transform: squish, boxShadow: 'inset 0 0 0 3px var(--merge-glow), 0 0 16px var(--merge-glow)', offset: 0 },
      { transform: `scale(${1 + punch * .9}) rotate(${tilt}deg)`, boxShadow: 'inset 0 0 0 1px var(--merge-glow)', offset: .20 },
      { transform: `scale(.90, 1.08) rotate(${-tilt * .7}deg)`, offset: .43 },
      { transform: 'scale(1.07, .95) rotate(.6deg)', offset: .64 },
      { transform: 'scale(.98, 1.025)', offset: .82 },
      { transform: 'scale(1)', offset: 1 },
    ], { duration: (470 + weight * 160 + (milestone ? 90 : 0)) * (fast ? .8 : 1), easing: 'cubic-bezier(.22,.65,.35,1)' }, () => {
      if (!body.getAnimations().some(a => a.playState === 'running')) tile.classList.remove('merged');
    });
  }

  accent(merge, milestone, particles) {
    if (particles) this.burst(merge, milestone);
    if (!milestone) return;
    this.effects.querySelector('.merge-milestone')?.remove();
    const badge = document.createElement('div');
    badge.className = 'merge-milestone';
    this.effectPalette(badge, merge.value);
    badge.textContent = `${merge.value.toLocaleString()} ✦`;
    this.effects.append(badge);
    this.animate(badge, [
      { opacity: 0, transform: 'translate(-50%, 8px) scale(.6) rotate(-6deg)', offset: 0 },
      { opacity: 1, transform: 'translate(-50%, -10px) scale(1.18) rotate(3deg)', offset: .16 },
      { opacity: 1, transform: 'translate(-50%, -6px) scale(1)', offset: .32 },
      { opacity: 1, transform: 'translate(-50%, -6px) scale(1)', offset: .75 },
      { opacity: 0, transform: 'translate(-50%, -12px) scale(1)', offset: 1 },
    ], { duration: 1250, easing: 'ease-out' }, () => badge.remove());
  }

  burst(merge, milestone) {
    const burst = document.createElement('div');
    burst.className = `merge-burst${milestone ? ' milestone-burst' : ''}`;
    this.effectPalette(burst, merge.value);
    const tile = this.tiles.get(merge.index);
    if (!tile) return;
    tile.append(burst);
    const count = milestone ? 12 : 8;
    const travel = burst.getBoundingClientRect().width * (milestone ? 1.25 : 1.05);
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('i');
      spark.className = 'merge-spark';
      burst.append(spark);
      const angle = Math.PI * 2 * i / count + Math.PI / 8;
      const distance = travel * (i % 2 ? .85 : 1);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      this.animate(spark, [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0, offset: 0 },
        { opacity: 1, offset: .12 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${i * 65}deg) scale(1)`, opacity: .9, offset: .55 },
        { transform: `translate(calc(-50% + ${x * 1.2}px), calc(-50% + ${y * 1.2 + 14}px)) rotate(${i * 90}deg) scale(.15)`, opacity: 0, offset: 1 },
      ], { duration: milestone ? 850 : 620, easing: 'linear' }, () => {
        spark.remove();
        if (!burst.childElementCount) burst.remove();
      });
    }
  }

  bump(milestone) {
    this.boardImpact?.cancel();
    this.boardImpact = this.animate(this.board, [
      { transform: 'scale(1)' },
      { transform: `scale(${milestone ? 1.035 : 1.018})`, offset: .2 },
      { transform: 'scale(.994)', offset: .5 },
      { transform: 'scale(1.004)', offset: .72 },
      { transform: 'scale(1)' },
    ], { duration: milestone ? 580 : 400, easing: 'ease-out' });
  }

  commit(result, spawned, { direction, beat, onBeat, onDownbeat, previousMax, fast, animate = true }) {
    const next = new Map();
    const groups = new Map();
    for (const move of result.movements) {
      if (!groups.has(move.to)) groups.set(move.to, []);
      groups.get(move.to).push(move);
    }
    for (const [index, group] of groups) {
      const survivor = group.find(m => m.from === index) || group[0];
      const tile = this.tiles.get(survivor.from);
      for (const move of group) {
        const source = this.tiles.get(move.from);
        source.classList.remove('anticipating');
        if (source !== tile) {
          for (const animation of source.getAnimations({ subtree: true })) animation.cancel();
          source.remove();
        }
      }
      tile.style.transitionDuration = '0ms';
      this.position(tile, index);
      this.value(tile, result.board[index]);
      next.set(index, tile);
    }
    this.tiles = next;
    if (spawned.index >= 0) {
      const tile = this.make(spawned.board[spawned.index], spawned.index);
      this.tiles.set(spawned.index, tile);
      if (animate && !this.reducedMotion.matches && !fast) this.animate(tile.querySelector('.tile-body'), [
        { transform: 'scale(.35)', opacity: .2 },
        { transform: 'scale(1.13)', opacity: 1, offset: .6 },
        { transform: 'scale(.96)', offset: .82 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 290, easing: 'cubic-bezier(.15,.8,.3,1)' });
    }
    if (animate && !this.reducedMotion.matches) {
      const largest = result.merges.reduce((best, merge) => !best || merge.value > best.value ? merge : best, null);
      for (const merge of result.merges) {
        const milestone = merge.value > previousMax && merge.value >= 128;
        this.impact(next.get(merge.index), merge.value, direction === 'left' || direction === 'right', onDownbeat, milestone, fast);
      }
      if (largest) {
        const milestone = largest.value > previousMax && largest.value >= 128;
        // Fast playback groups particle accents by beat.
        const freshBeat = beat !== this.lastAccentBeat;
        if (milestone || !fast || freshBeat) {
          for (const merge of result.merges) {
            if (fast && merge !== largest) continue;
            const record = merge.value > previousMax && merge.value >= 128;
            this.accent(merge, record, record || (merge === largest && (!fast || onBeat)));
          }
          if (milestone || (freshBeat && largest.value >= 64)) this.bump(milestone);
          this.lastAccentBeat = beat;
        }
      }
    }
    this.describe(spawned.board);
  }

  setPaused(paused) {
    for (const animation of this.animations) paused ? animation.pause() : animation.play();
  }
}
