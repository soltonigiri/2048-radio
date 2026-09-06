export const SUBDIVISIONS = [0.5, 1, 2, 4];

export function intervalFor(track, subdivision) {
  return 60 / track.bpm / subdivision;
}

export function gridAfter(time, track, subdivision = 1) {
  const interval = intervalFor(track, subdivision);
  const index = Math.max(0, Math.floor((time - track.beatOffset) / interval + 1e-8) + 1);
  return track.beatOffset + index * interval;
}

export function animationLead(track, subdivision, reducedMotion = false) {
  return reducedMotion || subdivision >= 16 ? 0 : Math.min(0.14, intervalFor(track, subdivision) * 0.6);
}

export function tooLate(time, target, track, subdivision) {
  return time - target > Math.min(0.045, intervalFor(track, subdivision) * 0.8);
}
