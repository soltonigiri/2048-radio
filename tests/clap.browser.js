// Run on the local app: agent-browser eval --stdin < tests/clap.browser.js
(async () => {
  const { audio } = await import('/app.js');
  const { slide } = await import('/game.js');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const button = id => document.getElementById(id);
  const settled = async id => {
    for (let i = 0; i < 100 && button(id).disabled; i++) await wait(50);
    assert(!button(id).disabled, `${id} finished loading`);
  };
  if (button('play-button').getAttribute('aria-label') !== '一時停止') button('play-button').click();
  if (!audio.enabled) { button('sound-button').click(); await settled('sound-button'); }
  for (let i = 0; i < 100 && (!audio.buffer || audio.clapEnabled && !audio.clapBuffer); i++) await wait(50);
  if (!audio.clapEnabled) { button('clap-button').click(); await settled('clap-button'); }
  assert(audio.clapBuffer?.duration > .05 && audio.clapBuffer.duration < .6, 'Real clap decoded');
  button('skip-button').click();
  let previous = null;
  let previousScore = 0;
  let checked = 0;
  const failures = [];
  const events = [];
  const listener = event => {
    events.push(event.detail);
    const current = Array(16).fill(0);
    for (const tile of button('tiles').children) current[Number(tile.dataset.index)] = Number(tile.dataset.value);
    const score = Number(button('score').textContent.replaceAll(',', ''));
    if (previous && score >= previousScore) {
      const direction = { '←': 'left', '↑': 'up', '→': 'right', '↓': 'down' }[button('move-direction').textContent];
      const result = slide(previous, direction);
      const spawned = current.flatMap((value, index) => value !== result.board[index] ? [index] : []);
      if (!result.changed || score !== previousScore + result.score || spawned.length !== 1 || result.board[spawned[0]] !== 0 || ![2, 4].includes(current[spawned[0]])) failures.push(`Invalid queued board at move ${checked}`);
      checked++;
    }
    previous = current; previousScore = score;
  };
  document.addEventListener('radio:move', listener);
  try {
    for (const speed of [4, 2, 4, 1, 4, 2, 1, 4]) {
      document.querySelector(`[data-speed="${speed}"]`).click(); await wait(350);
    }
    for (let i = 0; i < 160 && checked < 60; i++) await wait(50);
    assert(checked >= 40 && failures.length === 0, `Queue stays legal through rapid speed changes: ${failures.join(', ')}`);
    const merged = events.filter(event => event.merges > 0);
    assert(merged.length > 10 && merged.every(event => event.clap), 'Each merged move has a scheduled clap');
    assert(events.filter(event => !event.merges).every(event => !event.clap), 'No claps on plain moves');
    assert(merged.every(event => event.clap.at - event.clap.requestedAt < .02), 'Claps are scheduled ahead on the BGM clock');

    const bgm = audio.source;
    button('clap-button').click(); await settled('clap-button');
    assert(!audio.clapEnabled && audio.source === bgm && audio.enabled, 'Clap off preserves BGM');
    assert(audio.claps.size === 0, 'Clap off cancels queued sounds');
    assert(localStorage.getItem('2048-radio-clap') === 'off', 'Clap preference saved');
    await wait(350); events.length = 0;
    for (let i = 0; i < 120 && events.length < 5; i++) await wait(50);
    assert(events.length > 0 && events.every(event => !event.clap), `Clap remains off while board runs (${events.length} moves, ${events.filter(event => event.clap).length} claps)`);
    button('clap-button').click(); await settled('clap-button');
    for (let i = 0; i < 100 && audio.claps.size === 0; i++) await wait(50);
    assert(audio.clapEnabled && audio.claps.size > 0, 'Clap can be enabled again');

    button('play-button').click(); await wait(100);
    assert(audio.claps.size === 0 && !audio.source, 'Pause cancels queued audio');
    events.length = 0; await wait(250); assert(events.length === 0, 'Paused board stays still');
    button('play-button').click();
    for (let i = 0; i < 140 && !events.some(event => event.clap); i++) await wait(50);
    assert(events.some(event => event.clap), 'Resume schedules claps again');
    button('sound-button').click(); await settled('sound-button');
    assert(!audio.enabled && audio.claps.size === 0, 'Master mute stops claps too');
    assert(failures.length === 0, failures.join(', '));
    return { checkedMoves: checked, scheduledClaps: merged.length, checks: 'Legal queued boards, beat timing, clap on/off, persistence, pause/resume and master mute' };
  } finally {
    document.removeEventListener('radio:move', listener);
    document.querySelector('[data-speed="4"]').click();
  }
})()
