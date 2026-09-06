import { TRACKS } from './tracks.js';

// Decoded sources give the board and BGM a shared, sample-based clock.
// Two cached tracks bound memory; the following song is decoded in advance.
export class RadioAudio {
  constructor({ onTrack = () => {}, onError = () => {}, onClapError = () => {} } = {}) {
    this.enabled = false;
    this.paused = false;
    this.volume = 0.45;
    this.selected = 0;
    this.offset = 0;
    this.revision = 0;
    this.transition = 0;
    this.cache = new Map();
    this.onTrack = onTrack;
    this.onError = onError;
    this.onClapError = onClapError;
    this.clapEnabled = true;
    this.claps = new Set();
  }

  init() {
    if (this.context) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 128;
    this.master.connect(this.analyser);
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async loadClap() {
    if (this.clapBuffer) return this.clapBuffer;
    if (!this.clapLoading) {
      this.clapLoading = fetch('/assets/audio/hand-clap.wav')
        .then(response => { if (!response.ok) throw new Error('Could not load hand clap'); return response.arrayBuffer(); })
        .then(bytes => this.context.decodeAudioData(bytes))
        .then(buffer => { this.clapBuffer = buffer; return buffer; })
        .finally(() => { this.clapLoading = null; });
    }
    return this.clapLoading;
  }

  async setClapEnabled(value) {
    this.clapEnabled = value;
    if (!value) this.cancelClaps();
    else if (this.enabled && this.context) {
      try { await this.loadClap(); }
      catch (error) { this.clapEnabled = false; throw error; }
    }
  }

  cancelClap(clap) {
    if (!clap) return;
    clap.cancelled = true;
    if (!this.claps.has(clap)) return;
    clap.source.stop();
    clap.source.disconnect();
    clap.gain.disconnect();
    this.claps.delete(clap);
  }

  cancelClaps() {
    for (const clap of this.claps) this.cancelClap(clap);
  }

  scheduleClap(trackTime, strength = 1) {
    if (!this.enabled || !this.clapEnabled || this.paused || !this.source || !this.clapBuffer) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.clapBuffer;
    source.connect(gain).connect(this.master);
    gain.gain.value = .55 * Math.min(1.15, Math.max(.8, strength));
    // Use the BGM's sample clock, scheduling before the visual contact when possible.
    const requestedAt = this.startedAt + trackTime - this.offset;
    const at = Math.max(this.context.currentTime, requestedAt);
    const clap = { source, gain, at, requestedAt };
    this.claps.add(clap);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); this.claps.delete(clap);
    };
    source.start(at);
    return clap;
  }

  lookAhead() {
    if (!this.enabled || !this.source) return 0;
    return Math.max(.14, this.context.currentTime - this.outputTime() + .14);
  }

  async load(index) {
    if (!this.cache.has(index)) {
      const pending = fetch(TRACKS[index].file)
        .then(response => { if (!response.ok) throw new Error('Could not load BGM'); return response.arrayBuffer(); })
        .then(bytes => this.context.decodeAudioData(bytes));
      this.cache.set(index, pending);
      pending.catch(() => { if (this.cache.get(index) === pending) this.cache.delete(index); });
    }
    return this.cache.get(index);
  }

  outputTime() {
    const stamp = this.context.getOutputTimestamp?.();
    if (stamp?.performanceTime > 0 && stamp.contextTime > 0) {
      return Math.min(this.context.currentTime, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000);
    }
    return Math.max(0, this.context.currentTime - (this.context.outputLatency || 0));
  }

  clock() {
    if (!this.source || this.paused || !this.enabled) return null;
    return {
      time: this.offset + this.outputTime() - this.startedAt,
      revision: this.revision,
      track: this.selected,
      running: this.context.state === 'running',
    };
  }

  stop() {
    clearTimeout(this.nextTimer);
    this.cancelClaps();
    if (!this.source) return;
    this.offset = Math.max(0, Math.min(this.buffer.duration, this.offset + this.outputTime() - this.startedAt));
    const source = this.source;
    this.source = null;
    source.stop();
    this.revision++;
  }

  start(offset = this.offset) {
    clearTimeout(this.nextTimer);
    this.cancelClaps();
    const old = this.source;
    const oldGain = this.sourceGain;
    const at = this.context.currentTime + 0.06;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffer;
    source.playbackRate.value = 1;
    source.connect(gain).connect(this.master);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.1);
    this.source = source;
    this.sourceGain = gain;
    this.offset = offset >= this.buffer.duration ? 0 : offset;
    this.startedAt = at;
    this.revision++;
    source.onended = () => {
      source.disconnect(); gain.disconnect();
      if (source === this.source) {
        this.source = null;
        if (this.enabled && !this.paused) this.next().catch(this.onError);
      }
    };
    source.start(at, this.offset);
    if (old) {
      oldGain.gain.cancelScheduledValues(this.context.currentTime);
      oldGain.gain.setValueAtTime(oldGain.gain.value, this.context.currentTime);
      oldGain.gain.linearRampToValueAtTime(0, at + 0.1);
      old.stop(at + 0.11);
    }
    const next = (this.selected + 1) % TRACKS.length;
    for (const key of this.cache.keys()) if (key !== this.selected && key !== next) this.cache.delete(key);
    this.load(next).catch(() => {});
    // A short crossfade at the end avoids a gap between decoded tracks.
    this.nextTimer = setTimeout(() => {
      if (source === this.source && this.enabled && !this.paused) this.next().catch(this.onError);
    }, Math.max(0, (this.buffer.duration - this.offset - 0.12) * 1000));
  }

  async enable() {
    this.init();
    const token = ++this.transition;
    this.enabled = true;
    try {
      await this.context.resume();
      const buffer = await this.load(this.selected);
      if (token !== this.transition) return;
      if (this.clapEnabled) {
        try { await this.loadClap(); }
        catch (error) { this.clapEnabled = false; this.onClapError(error); }
      }
      if (token !== this.transition) return;
      this.buffer = buffer;
      if (!this.paused) this.start();
      this.setVolume(this.volume);
    } catch (error) { if (token === this.transition) { this.enabled = false; throw error; } }
  }

  disable() {
    this.enabled = false;
    this.transition++;
    this.stop();
    this.setVolume(this.volume);
  }

  async setPaused(value) {
    if (value === this.paused) return;
    this.paused = value;
    if (value) this.stop();
    else if (this.enabled && this.buffer) {
      await this.context.resume();
      if (!this.paused && this.enabled && !this.source) this.start();
    }
  }

  setVolume(value) {
    this.volume = value;
    if (this.context) this.master.gain.setTargetAtTime(this.enabled ? value * 0.8 : 0, this.context.currentTime, 0.04);
  }

  async select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= TRACKS.length) return;
    const token = ++this.transition;
    if (index === this.selected) { this.onTrack(index); return; }
    if (!this.context) {
      this.selected = index; this.offset = 0; this.revision++;
      this.onTrack(index); return;
    }
    try {
      const buffer = await this.load(index);
      if (token !== this.transition) return;
      this.buffer = buffer;
      this.selected = index;
      if (this.enabled && !this.paused) this.start(0);
      else { this.stop(); this.offset = 0; }
      this.onTrack(index);
    } catch (error) { if (token === this.transition) throw error; }
  }

  async next() {
    if (TRACKS.length === 1) {
      this.offset = 0;
      if (this.enabled && !this.paused && this.buffer) this.start(0);
      this.onTrack(this.selected);
      return;
    }
    return this.select((this.selected + 1) % TRACKS.length);
  }

  // Also used by the local regression check to verify resume and seek alignment.
  seek(time) {
    if (!this.buffer) return;
    this.offset = Math.max(0, Math.min(this.buffer.duration - 0.01, time));
    if (this.enabled && !this.paused) this.start(this.offset);
  }

  levels() {
    if (!this.enabled || this.paused || !this.analyser) return null;
    this.analyser.getByteFrequencyData(this.spectrum);
    return this.spectrum;
  }
}
