import { createEngine } from './engine.js';

const loading = createEngine();
let newestRequest = -1;
self.onmessage = async ({ data }) => {
  newestRequest = data.id;
  const engine = await loading;
  if (data.id !== newestRequest) return;
  const started = performance.now();
  const result = engine.choose(data.board);
  self.postMessage({ id: data.id, ...result, elapsedMs: performance.now() - started });
};
// Module-load failures surface through Worker.onerror in the UI.
await loading;
