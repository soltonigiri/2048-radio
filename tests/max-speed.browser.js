(async () => {
  const { slide } = await import('/game.js');
  const { audio } = await import('/app.js');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const button = id => document.getElementById(id);
  const speed = value => document.querySelector(`[data-speed="${value}"]`).click();
  const board = () => {
    const values = Array(16).fill(0);
    for (const tile of button('tiles').children) values[Number(tile.dataset.index)] = Number(tile.dataset.value);
    return values;
  };
  const settled = async id => { while (button(id).disabled) await wait(20); };
  if (button('play-button').getAttribute('aria-label') !== '一時停止') button('play-button').click();
  if (audio.enabled) { button('sound-button').click(); await settled('sound-button'); }
  speed('max');
  button('skip-button').click();
  let previous = board();
  let score = 0;
  let checked = 0;
  const events = [];
  const failures = [];
  const listener = ({ detail }) => {
    const direction = { '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' }[button('move-direction').textContent];
    const result = slide(previous, direction);
    const current = board();
    const nextScore = Number(button('score').textContent.replaceAll(',', ''));
    const changed = current.flatMap((value, i) => value !== result.board[i] ? [i] : []);
    if (!result.changed || nextScore !== score + result.score || changed.length !== 1 || result.board[changed[0]] !== 0 || ![2, 4].includes(current[changed[0]])) failures.push(`Illegal state at move ${checked}`);
    events.push({ ...detail, stamp: performance.now() });
    checked++; previous = current; score = nextScore;
  };
  document.addEventListener('radio:move', listener);
  try {
    const start = performance.now();
    await wait(1000);
    const elapsed = performance.now() - start;
    const initial = events.slice();
    assert(initial.length > 10 && initial.every(e => e.subdivision === 'max'), 'MAX makes progress without a beat target');
    assert(initial.every(e => e.time === e.target), 'MAX commits immediately on completion');
    button('play-button').click();
    const paused = checked;
    await wait(250);
    assert(checked === paused, 'In-flight worker responses do not advance a paused MAX game');
    button('play-button').click();
    await wait(250);
    assert(checked > paused, 'MAX resumes');

    speed(4);
    const switched = events.length;
    await wait(700);
    assert(events.length > switched && events.slice(switched).every(e => e.subdivision === 4), 'Returning from MAX restores beat mode');
    for (const value of ['max', 4, 'max', 2, 'max']) { speed(value); await wait(30); }
    await wait(200);
    assert(events.at(-1).subdivision === 'max', 'Rapid switches do not restore stale mode or boards');

    button('sound-button').click(); await settled('sound-button');
    if (!audio.clapEnabled) { button('clap-button').click(); await settled('clap-button'); }
    events.length = 0;
    await wait(700);
    assert(audio.source?.playbackRate.value === 1, 'MAX keeps original BGM speed');
    const claps = events.filter(e => e.clap);
    assert(events.every(e => Boolean(e.clap) === (e.merges > 0)), 'MAX claps on every merged move without dropping fast claps');
    assert(claps.length > 0, 'MAX retains hand claps');
    button('clap-button').click(); await settled('clap-button');
    events.length = 0; await wait(200);
    assert(events.every(e => !e.clap), 'Clap toggle works in MAX');
    assert(failures.length === 0, failures.join(', '));
    const intervals = initial.slice(1).map((e, i) => e.stamp - initial[i].stamp).sort((a, b) => a - b);
    return { checkedMoves: checked, audibleMergeMoves: claps.length, initialMovesPerSecond: initial.length * 1000 / elapsed, medianIntervalMs: intervals[Math.floor(intervals.length / 2)], checks: 'Legal boards, immediate commits, pause/resume, return to beat mode, rapid switches, BGM rate and one clap per merged move' };
  } finally {
    document.removeEventListener('radio:move', listener);
    speed(4);
  }
})()
