import { newGame, slide, spawn, isGameOver } from './game.js';
import { RadioAudio } from './audio.js';
import { TRACKS } from './tracks.js';
import { BoardMotion } from './motion.js';
import { intervalFor, gridAfter, animationLead, tooLate } from './rhythm.js';

const $ = id => document.getElementById(id);
export const audio = new RadioAudio({ onTrack: renderTrack, onError: reportAudioError, onClapError: reportClapError });
try { audio.clapEnabled = localStorage.getItem('2048-radio-clap') !== 'off'; } catch { /* Optional. */ }
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = new BoardMotion($('board'), $('tiles'), reducedMotion);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) motion.clearEffects(); });
let board;
let score = 0;
let moves = 0;
let track = 0;
let subdivision = 1;
let requestedSubdivision = 1;
let switchAt = null;
let pendingMove = null;
let moveQueue = [];
let nextPlanBeat = null;
let clockKey = '';
let virtualOrigin = performance.now();
let virtualPaused = 0;
let lastPulse = -1;
let playing = false;
let hasStarted = false;
let soundOn = true;
let ending = false;
let endingUntil = 0;
let pausedAt = 0;
let readyMove;
let requestId = 0;
let timer;
let backgroundTimer;
let reached = 2;
let history = [];
let faulted = false;

try {
  const saved = JSON.parse(localStorage.getItem('2048-radio-history-v2') || '[]');
  if (Array.isArray(saved)) history = saved.filter(item => item && Number.isInteger(item.track) && item.track >= 0 && item.track < TRACKS.length && Number.isFinite(item.score) && Number.isFinite(item.max) && ['finished', 'skipped'].includes(item.reason)).slice(0, 8);
} catch { /* Storage may be disabled; listening still works. */ }

document.querySelector('.board-cells').replaceChildren(...Array.from({ length: 16 }, () => {
  const cell = document.createElement('div'); cell.className = 'board-cell'; return cell;
}));
$('visualizer').replaceChildren(...Array.from({ length: 28 }, () => document.createElement('i')));

function renderBoard() {
  motion.reset(board);
}

function animateMove(result, duration) {
  motion.prepare(result, duration);
}

function askAI(state = board) {
  readyMove = undefined;
  worker.postMessage({ board: state, id: ++requestId });
}

function cancelPending() {
  const hadPlans = pendingMove || moveQueue.length;
  if (pendingMove) audio.cancelClap(pendingMove.clap);
  for (const move of moveQueue) audio.cancelClap(move.clap);
  pendingMove = null; moveQueue = []; nextPlanBeat = null;
  if (hadPlans) { renderBoard(); askAI(); }
}

function planningBoard() {
  return moveQueue.at(-1)?.spawned.board || pendingMove?.spawned.board || board;
}

function addClap(move) {
  if (!move.result.merges.length || move.clap && !move.clap.cancelled) return;
  // Re-enabling should join upcoming beats, without replaying already-rendered audio.
  if (audio.context && audio.startedAt + move.target - audio.offset < audio.context.currentTime) return;
  const largest = Math.max(...move.result.merges.map(merge => merge.value));
  move.clap = audio.scheduleClap(move.target, largest >= 128 ? 1.1 : 1);
}

worker.onmessage = ({ data }) => {
  if (data.id !== requestId) return;
  readyMove = data.direction;
  // Refill from worker completions as well as frames; fast playback must not pay
  // an extra animation-frame delay for every AI search in the audio lookahead.
  const clock = active() && !ending ? getClock() : null;
  if (subdivision === 'max') {
    if (clock?.running) advanceMax(clock);
    return;
  }
  if (clock?.running && clock.key === clockKey && nextPlanBeat !== null && nextPlanBeat <= clock.time + audio.lookAhead()) planMove(TRACKS[track]);
};
worker.onerror = event => {
  event.preventDefault();
  faulted = true;
  playing = false;
  syncPlayback();
  $('error-message').hidden = false;
  $('error-message').textContent = 'AIを読み込めません。ページを再読み込みしてください。';
  $('announcement').textContent = 'AIの読み込みに失敗しました。ページを再読み込みしてください。';
  $('play-button').disabled = true;
  $('skip-button').disabled = true;
};

function renderStats() {
  const max = Math.max(...board);
  $('score').textContent = score.toLocaleString('en-US');
  if (max > reached) {
    reached = max;
    if (max >= 128) $('announcement').textContent = `${max}のタイルができました。`;
  }
}

function archive(reason) {
  if (!moves) return;
  history.unshift({ track, score, max: Math.max(...board), reason });
  history = history.slice(0, 8);
  try { localStorage.setItem('2048-radio-history-v2', JSON.stringify(history)); } catch { /* Optional. */ }
}

function startTrack() {
  cancelPending();
  nextPlanBeat = null;
  board = newGame(); score = 0; moves = 0; reached = 2; ending = false;
  $('move-direction').textContent = '—';
  $('board-overlay').hidden = true;
  renderBoard(); renderStats(); askAI();
}

function finishTrack() {
  ending = true;
  endingUntil = performance.now() + 2200;
  archive('finished');
  $('board-overlay').hidden = false;
  $('announcement').textContent = 'この盤面は終了です。次の盤面へ進みます。';
}

function visualize() {
  const spectrum = active() && soundOn ? audio.levels() : null;
  $('visualizer').classList.toggle('sounding', Boolean(spectrum));
  [...$('visualizer').children].forEach((bar, index) => {
    bar.style.height = `${spectrum ? 2 + spectrum[index * 2] / 9 : 3}px`;
  });
}
setInterval(visualize, 100);

function renderTrack(index) {
  track = index;
  $('track-title').textContent = TRACKS[index].title;
  $('track-source').href = `https://incompetech.com/music/royalty-free/index.html?isrc=${TRACKS[index].isrc}`;
  virtualOrigin = performance.now();
  clockKey = '';
  renderSpeed();
}

function reportAudioError() {
  audio.disable();
  soundOn = false;
  syncSoundUI();
  $('error-message').hidden = false;
  $('error-message').textContent = 'BGMを再生できません。音をオンにして再試行してください。';
}

function syncClapUI() {
  const button = $('clap-button');
  button.setAttribute('aria-pressed', String(audio.clapEnabled));
  button.title = audio.clapEnabled ? '手拍子をオフにする' : '手拍子をオンにする';
  button.setAttribute('aria-label', button.title);
}

function reportClapError() {
  syncClapUI();
  $('error-message').hidden = false;
  $('error-message').textContent = '手拍子を読み込めません。手拍子ボタンで再試行してください。';
}

function syncSoundUI() {
  $('sound-button').setAttribute('aria-pressed', String(soundOn));
  $('sound-button').setAttribute('aria-label', soundOn ? '音をオフにする' : '音をオンにする');
  $('sound-button').title = soundOn ? '音をオフにする' : '音をオンにする';
  $('sound-button').querySelector('path').setAttribute('d', soundOn ? 'M4 9h4l5-4v14l-5-4H4V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'M4 9h4l5-4v14l-5-4H4V9Zm17 0-5 6m0-6 5 6');
}

function enableSound() {
  audio.enable().then(() => {
    if (!soundOn || !audio.enabled) return;
    syncClapUI();
    if (audio.source) schedule();
  }).catch(error => {
    if (error.name !== 'NotAllowedError') reportAudioError();
  });
}

function planMove(song) {
  if (readyMove === undefined || readyMove === null) return;
  if (audio.enabled && audio.source) {
    const earliest = audio.offset + audio.context.currentTime - audio.startedAt + .01;
    if (nextPlanBeat < earliest) {
      const speed = switchAt !== null && earliest >= switchAt ? requestedSubdivision : subdivision;
      nextPlanBeat = gridAfter(earliest, song, speed);
    }
  }
  const state = planningBoard();
  const direction = readyMove;
  const result = slide(state, direction);
  if (!result.changed) { askAI(state); return; }
  const spawned = spawn(result.board);
  const speed = switchAt !== null && nextPlanBeat >= switchAt - 1e-6 ? requestedSubdivision : subdivision;
  const move = { direction, result, spawned, target: nextPlanBeat, subdivision: speed };
  addClap(move);
  moveQueue.push(move);
  nextPlanBeat = gridAfter(nextPlanBeat + intervalFor(song, speed) / 2, song, speed);
  if (switchAt !== null && move.target < switchAt && nextPlanBeat > switchAt) nextPlanBeat = switchAt;
  askAI(spawned.board);
}

function commitMove(clock) {
  const { direction, result, spawned, target, clap, subdivision: moveSpeed } = pendingMove;
  pendingMove = null;
  const previousMax = reached;
  board = spawned.board; score += result.score; moves++;
  $('move-direction').textContent = { left: '←', up: '↑', right: '→', down: '↓' }[direction];
  $('move-direction').setAttribute('aria-label', `直前の移動：${{ left: '左', up: '上', right: '右', down: '下' }[direction]}`);
  const song = TRACKS[track];
  const beatPosition = (target - song.beatOffset) / (60 / song.bpm);
  const onBeat = Math.abs(beatPosition - Math.round(beatPosition)) < 1e-6;
  motion.commit(result, spawned, {
    direction, previousMax, animate: !document.hidden, fast: moveSpeed === 'max' || moveSpeed >= 8,
    beat: Math.floor(beatPosition + 1e-6), onBeat,
    onDownbeat: onBeat && Math.round(beatPosition) % 4 === 0,
  });
  renderStats();
  // A small event also lets the local regression check measure real commits.
  document.dispatchEvent(new CustomEvent('radio:move', { detail: {
    time: clock.time, target, track, subdivision: moveSpeed, merges: result.merges.length, source: clock.source,
    clap: clap && !clap.cancelled ? { at: clap.at, requestedAt: clap.requestedAt } : null,
  } }));
}

function advanceMax(clock) {
  if (readyMove === undefined) return;
  if (isGameOver(board)) { finishTrack(); return; }
  const direction = readyMove;
  if (direction === null) return;
  const result = slide(board, direction);
  if (!result.changed) { askAI(); return; }
  const spawned = spawn(result.board);
  const move = { direction, result, spawned, target: clock.time, subdivision: 'max' };
  // MAX follows computation, with one clap for each move that merges tiles.
  if (result.merges.length && audio.enabled && audio.source) {
    const now = audio.context.currentTime;
    const largest = Math.max(...result.merges.map(merge => merge.value));
    move.clap = audio.scheduleClap(audio.offset + now - audio.startedAt, largest >= 128 ? 1.1 : 1);
  }
  // Start the next search before rendering, so the worker can run concurrently.
  askAI(spawned.board);
  pendingMove = move;
  commitMove(clock);
}

function active() { return playing && !faulted; }
function getClock() {
  const music = audio.clock();
  if (music) return { ...music, key: `audio:${music.revision}:${music.track}`, source: 'audio' };
  if (soundOn && audio.enabled && audio.context?.state === 'running') return null;
  return { time: (performance.now() - virtualOrigin) / 1000, key: `silent:${track}`, source: 'silent', running: true };
}

function renderSpeed() {
  const value = requestedSubdivision;
  document.querySelector('.tempo-control').classList.toggle('pending', switchAt !== null);
  document.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.speed === String(value))));
}

function schedule() {
  cancelAnimationFrame(timer);
  clearTimeout(backgroundTimer);
  cancelPending();
  clockKey = '';
  if (!active()) return;
  function nextFrame() {
    // Hidden tabs suspend animation frames; audio and game timing continue.
    if (document.hidden) backgroundTimer = setTimeout(frame, 16);
    else timer = requestAnimationFrame(frame);
  }
  function frame() {
    if (!active()) return;
    nextFrame();
    const clock = getClock();
    if (!clock || !clock.running) return;
    const song = TRACKS[track];
    if (clock.key !== clockKey) {
      cancelPending();
      clockKey = clock.key;
      subdivision = requestedSubdivision;
      switchAt = null;
      nextPlanBeat = subdivision === 'max' ? null : gridAfter(clock.time + audio.lookAhead(), song, subdivision);
      renderSpeed();
    }
    if (switchAt !== null && clock.time >= switchAt) {
      subdivision = requestedSubdivision;
      switchAt = null;
      renderSpeed();
    }
    const pulse = Math.floor((clock.time - song.beatOffset) / (60 / song.bpm));
    if (pulse !== lastPulse && pulse >= 0) {
      lastPulse = pulse;
      [...$('beat-dots').children].forEach((dot, index) => dot.classList.toggle('on', index === pulse % 4));
    }
    if (ending) {
      if (performance.now() >= endingUntil) startTrack();
      return;
    }
    if (subdivision === 'max') { advanceMax(clock); return; }
    if (!pendingMove && !moveQueue.length && isGameOver(board)) { finishTrack(); return; }
    const first = pendingMove || moveQueue[0];
    if (first && tooLate(clock.time, first.target, song, first.subdivision)) cancelPending();
    if (nextPlanBeat === null || (!pendingMove && !moveQueue.length && tooLate(clock.time, nextPlanBeat, song, subdivision))) {
      nextPlanBeat = gridAfter(clock.time + audio.lookAhead(), song, subdivision);
    }
    const horizon = clock.time + Math.max(audio.lookAhead(), animationLead(song, subdivision, reducedMotion.matches));
    if (nextPlanBeat <= horizon) planMove(song);
    const queued = moveQueue[0];
    if (!pendingMove && queued && clock.time >= queued.target - animationLead(song, queued.subdivision, reducedMotion.matches)) {
      pendingMove = moveQueue.shift();
      if (!document.hidden) animateMove(pendingMove.result, Math.max(0, pendingMove.target - clock.time));
    }
    if (pendingMove && clock.time >= pendingMove.target) commitMove(clock);
  }
  nextFrame();
}

function syncPlayback() {
  const running = active();
  document.body.classList.toggle('paused', !running);
  const label = playing ? '一時停止' : hasStarted ? '再開' : 'スタート';
  $('play-button').classList.toggle('is-start', !hasStarted);
  $('play-button').setAttribute('aria-label', label);
  $('play-button').title = `${label}（Space）`;
  $('play-button').innerHTML = playing
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="3"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor"/></svg>' + (hasStarted ? '' : '<span>START</span>');
  $('live-dot').title = running ? '再生中' : '一時停止';
  if (!running) {
    if (!pausedAt) { pausedAt = performance.now(); virtualPaused = performance.now(); }
    visualize();
  } else if (pausedAt) {
    if (ending) endingUntil += performance.now() - pausedAt;
    virtualOrigin += performance.now() - virtualPaused;
    pausedAt = 0;
  }
  audio.setPaused(!running).catch(reportAudioError);
  audio.setVolume(Number($('volume').value) / 100);
  schedule();
  motion.setPaused(!running);
}

function togglePlayback() {
  playing = !playing;
  if (playing) hasStarted = true;
  syncPlayback();
  if (playing && soundOn && !audio.enabled) enableSound();
}

$('play-button').addEventListener('click', togglePlayback);
$('skip-button').addEventListener('click', () => {
  if (!ending) archive('skipped');
  startTrack(); syncPlayback();
});
$('volume').addEventListener('input', () => audio.setVolume(Number($('volume').value) / 100));
$('clap-button').addEventListener('click', async () => {
  const button = $('clap-button');
  button.disabled = true;
  try {
    await audio.setClapEnabled(!audio.clapEnabled);
    if (audio.clapEnabled) {
      if (pendingMove) addClap(pendingMove);
      for (const move of moveQueue) addClap(move);
    } else {
      if (pendingMove) audio.cancelClap(pendingMove.clap);
      for (const move of moveQueue) audio.cancelClap(move.clap);
    }
    try { localStorage.setItem('2048-radio-clap', audio.clapEnabled ? 'on' : 'off'); } catch { /* Optional. */ }
    $('error-message').hidden = true;
  } catch { reportClapError(); }
  finally { syncClapUI(); button.disabled = false; }
});
$('sound-button').addEventListener('click', async () => {
  const button = $('sound-button');
  button.disabled = true;
  $('error-message').hidden = true;
  try {
    if (soundOn) { audio.disable(); soundOn = false; }
    else { await audio.enable(); soundOn = true; }
    syncClapUI();
    syncSoundUI();
    schedule();
  } catch { reportAudioError(); }
  finally { button.disabled = false; }
});
document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => {
  const previous = requestedSubdivision;
  requestedSubdivision = button.dataset.speed === 'max' ? 'max' : Number(button.dataset.speed);
  if (previous === requestedSubdivision) return;
  if (previous === 'max' || requestedSubdivision === 'max') {
    subdivision = requestedSubdivision;
    switchAt = null;
    audio.cancelClaps();
    schedule();
    renderSpeed();
    return;
  }
  const clock = getClock();
  switchAt = active() && clock ? gridAfter(clock.time + audio.lookAhead(), TRACKS[track]) : null;
  if (switchAt === null) { subdivision = requestedSubdivision; schedule(); }
  else {
    // Replace only future plans at the speed-change beat; retain preceding moves.
    const removed = moveQueue.filter(move => move.target >= switchAt - 1e-6);
    for (const move of removed) audio.cancelClap(move.clap);
    moveQueue = moveQueue.filter(move => move.target < switchAt - 1e-6);
    if (pendingMove && pendingMove.target >= switchAt - 1e-6) {
      audio.cancelClap(pendingMove.clap); pendingMove = null; renderBoard();
    }
    nextPlanBeat = Math.min(nextPlanBeat ?? switchAt, switchAt);
    askAI(planningBoard());
  }
  renderSpeed();
}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) motion.clearEffects();
  schedule();
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || $('about-dialog').open || /INPUT|BUTTON|A|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  event.preventDefault();
  if (!faulted) togglePlayback();
});
$('about-button').addEventListener('click', () => $('about-dialog').showModal());
$('close-about').addEventListener('click', () => $('about-dialog').close());
$('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) { const bounds = event.target.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close(); } });
window.addEventListener('pagehide', () => { cancelAnimationFrame(timer); clearTimeout(backgroundTimer); cancelPending(); audio.disable(); });
window.addEventListener('pageshow', event => { if (event.persisted) { syncSoundUI(); syncPlayback(); if (playing && soundOn) enableSound(); } });

renderTrack(0); startTrack(); syncSoundUI(); syncClapUI(); syncPlayback();
